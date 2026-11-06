import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, stop, faceTo, findSpot, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, lineOfSightB } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, Region, V3, Wt, Row, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash, tube, headLoft, handLoft, footLoft, FOOT_BARE, wLerp, lookAngles, nearestSurvivor } from '../kit/humanoids';
import { chain, sac, plate, blade, paintCap, paintSkin } from '../kit/organic';
import { ruleShown } from '../rules';
import { SIDES, absBones, say, linePoll, watching, nearestUnit, gait, paintPlush, paintFelt, stitches, runs, soak } from './pg_common';

// =====================================================================================
// DOOLEY DUCKBILL — the host of "Dooley's Dino Den" (Bright Hour Television,
// 1991-1998): a two-metre walk-around hadrosaur costume in tangerine plush with
// a cream belly, a teal crest and felt back plates, googly eyes and a sewn-on
// felt grin that never changes. The costume is still performing. The belly
// seam has split from the breastbone to the crotch, and through it you can see
// what wears it now: wet red meat pressed against the lining, the curve of a
// rib, and a human hand that keeps gripping the edge of the split from inside.
// Behind the mesh in its mouth, a real eye looks out.
// It performs. While you watch, it dances its numbers and only creeps closer
// between them. Look away and the show is over: it runs at you for a hug.
//   pg_dooley   skinned kit rig: plush torso with the split seam, flesh bulge and the
//               inner hand, duck-bill head with a dropping jaw and the mouth mesh,
//               googly pupils on springs, crest, felt plates, mitts, foam feet, tail
// VIDEO / POSTER API (stand-alone):
//   buildDooley(variant?)                          -> KitRig (rig.root into any scene)
//   poseDooley(rig, t, dt, pose, { split, speed })  pose: 'idle' | 'walk' | 'run' | 'wave' | 'dance' |
//                                                   'bow' | 'hug' | 'squeeze' | 'dead'
// =====================================================================================

function bonesDooley(v: number) {
  const s = 1 + (v % 2) * 0.03;
  return absBones([
    ['base', '', [0, 0, 0]],
    ['hips', 'base', [0, 0.92, 0]],
    ['belly', 'hips', [0, 1.04, 0.08]],
    ['seam', 'belly', [0, 1.1, 0.46]],
    ['inHand', 'seam', [0.02, 1.2, 0.47]],
    ['inF1', 'inHand', [0.025, 1.205, 0.53]],
    ['inF2', 'inF1', [0.03, 1.18, 0.565]],
    ['inTh', 'inHand', [-0.03, 1.19, 0.52]],
    ['chest', 'hips', [0, 1.36 * s, -0.02]],
    ['neck', 'chest', [0, 1.6 * s, 0.02], true],
    ['head', 'neck', [0, 1.8 * s, 0.08], true],
    ['jaw', 'head', [0, 1.77 * s, 0.2], true],
    ['crest', 'head', [0, 1.98 * s, 0.04], true],
    ['eyeL', 'head', [0.13, 1.92 * s, 0.19]], ['pupL', 'eyeL', [0.155, 1.925 * s, 0.265]],
    ['eyeR', 'head', [-0.13, 1.92 * s, 0.19]], ['pupR', 'eyeR', [-0.155, 1.925 * s, 0.265]],
    ['uarmL', 'chest', [0.31, 1.47 * s, 0.02], true], ['farmL', 'uarmL', [0.36, 1.2 * s, 0.06], true], ['handL', 'farmL', [0.385, 0.96 * s, 0.1], true],
    ['fing1L', 'handL', [0.39, 0.84 * s, 0.11]], ['fing2L', 'fing1L', [0.392, 0.78 * s, 0.115]], ['thumbL', 'handL', [0.375, 0.92 * s, 0.15]],
    ['uarmR', 'chest', [-0.31, 1.47 * s, 0.02], true], ['farmR', 'uarmR', [-0.36, 1.2 * s, 0.06], true], ['handR', 'farmR', [-0.385, 0.96 * s, 0.1], true],
    ['fing1R', 'handR', [-0.39, 0.84 * s, 0.11]], ['fing2R', 'fing1R', [-0.392, 0.78 * s, 0.115]], ['thumbR', 'handR', [-0.375, 0.92 * s, 0.15]],
    ['thighL', 'hips', [0.19, 0.86, 0], true], ['shinL', 'thighL', [0.2, 0.48, 0.03], true], ['footL', 'shinL', [0.2, 0.12, 0]],
    ['thighR', 'hips', [-0.19, 0.86, 0], true], ['shinR', 'thighR', [-0.2, 0.48, 0.03], true], ['footR', 'shinR', [-0.2, 0.12, 0]],
    ['tail0', 'hips', [0, 0.96, -0.34]], ['tail1', 'tail0', [0, 0.8, -0.66], true], ['tail2', 'tail1', [0, 0.52, -0.96], true], ['tail3', 'tail2', [0, 0.25, -1.22]], ['tail4', 'tail3', [0, 0.12, -1.46]],
  ]);
}

function layoutDooley(p: Page) {
  p.reg('TORSO', 96, 72, [0.62, 1.66]);
  p.reg('HEAD', 64, 44, [-0.15, 0.28]);
  p.reg('TAIL', 40, 44);
  p.reg('LEG', 32, 44);
  p.reg('ARM', 28, 40);
  p.reg('BILL', 44, 28);
  p.reg('JAW', 40, 22);
  p.reg('NECK', 40, 16);
  p.reg('FLESH', 24, 36);
  p.reg('LIP', 12, 32);
  p.reg('MITT', 24, 30);
  p.reg('FOOT', 36, 26);
  p.reg('TOE', 16, 12);
  p.reg('CREST', 28, 24);
  p.reg('PLATE', 16, 16);
  p.reg('EYE', 16, 16);
  p.reg('PUP', 8, 8);
  p.reg('MESH', 28, 12);
  p.reg('SKIN', 16, 16);
  p.reg('CLAW', 8, 8);
  p.reg('CAP', 16, 16);
}

const TORSO: Row[] = [
  { y: 0.62, rx: 0.12, rf: 0.12, rb: 0.12 },
  { y: 0.7, rx: 0.27, rf: 0.27, rb: 0.28 },
  { y: 0.8, rx: 0.37, rf: 0.39, rb: 0.37 },
  { y: 0.95, rx: 0.43, rf: 0.47, rb: 0.4, cz: 0.02 },
  { y: 1.1, rx: 0.43, rf: 0.48, rb: 0.38, cz: 0.03 },
  { y: 1.25, rx: 0.39, rf: 0.41, rb: 0.34, cz: 0.01 },
  { y: 1.4, rx: 0.33, rf: 0.32, rb: 0.3 },
  { y: 1.52, rx: 0.27, rf: 0.25, rb: 0.25 },
  { y: 1.6, rx: 0.2, rf: 0.2, rb: 0.2 },
  { y: 1.66, rx: 0.16, rf: 0.17, rb: 0.17 },
];
const HEAD: Row[] = [
  { y: -0.13, rx: 0.12, rf: 0.14, rb: 0.12 },
  { y: -0.08, rx: 0.19, rf: 0.22, rb: 0.18, cz: 0.01 },
  { y: 0.0, rx: 0.235, rf: 0.25, rb: 0.21, cz: 0.02 },
  { y: 0.08, rx: 0.245, rf: 0.24, rb: 0.22, cz: 0.02 },
  { y: 0.16, rx: 0.215, rf: 0.2, rb: 0.205 },
  { y: 0.22, rx: 0.15, rf: 0.13, rb: 0.15 },
  { y: 0.26, rx: 0.07, rf: 0.06, rb: 0.08 },
];

function buildDooleyMesh(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, s = 1 + (x.variant % 2) * 0.03;
  const H = bi('hips'), BE = bi('belly'), CH = bi('chest');
  // ---- the body: a pear of plush, the belly swinging on its own bone
  tube(B, {
    rows: TORSO, ys: [0.62, 0.66, 0.7, 0.75, 0.8, 0.87, 0.95, 1.02, 1.1, 1.18, 1.25, 1.33, 1.4, 1.46, 1.52, 1.56, 1.6, 1.63, 1.66], n: 16, reg: R('TORSO'), vr: R('TORSO').range, g: 1,
    w: (y, p) => {
      const front = Math.max(0, Math.min(1, (p[2] - 0.12) / 0.25)) * Math.max(0, 1 - Math.abs(y - 1.05) / 0.32);
      const base: Wt = y < 1.12 ? [H, 1] : y < 1.32 ? wLerp(y, 1.12, 1.32, H, CH) : [CH, 1];
      return front > 0.05 ? [...base.map((q, i) => (i % 2 ? q * (1 - front) : q)), BE, front] : base;
    },
    // a soft stuffed lumpiness, a sag of the belly over the crotch, a crease under each arm
    bump: (th, y) => 0.025 * Math.sin(th * 5 + y * 9) + 0.02 * Math.sin(th * 3 - y * 13) - 0.05 * Math.exp(-((y - 1.38) ** 2) / 0.002) * Math.exp(-((Math.abs(th) - 1.6) ** 2) / 0.1),
    start: [0, 0.6, 0], end: [0, 1.67, 0],
  });
  // ---- the split seam: two rolled lips of plush, the wet bulge between them, the hand that grips the edge
  const SE = bi('seam');
  const sp: V3[] = [[0, 0.86, 0.44], [0, 0.96, 0.49], [0, 1.08, 0.505], [0, 1.2, 0.48], [0, 1.3, 0.43]];
  sac(B, R('FLESH'), 2, sp, [[0.012, 0.012], [0.05, 0.035], [0.066, 0.045], [0.052, 0.036], [0.012, 0.012]], sp.map(() => [SE, 0.8, BE, 0.2]), { n: 10, up: [0, 0, 1],
    bump: (a, t) => 0.12 * Math.sin(t * 22) * Math.sin(Math.PI * t) + 0.08 * Math.sin(a * 3 + t * 9) });
  for (const k of [1, -1]) {
    const lp = sp.map((p, i): V3 => [k * (0.018 + Math.sin((i / 4) * Math.PI) * 0.058), p[1], p[2] - 0.004 + Math.sin((i / 4) * Math.PI) * 0.012]);
    sac(B, R('LIP'), 3, lp, lp.map((_, i) => [0.022 + Math.sin((i / 4) * Math.PI) * 0.01, 0.02] as [number, number]), lp.map(() => [BE, 0.7, SE, 0.3]), { n: 6, up: [0, 0, 1], bump: (a, t) => (hash(Math.round(a * 3), Math.round(t * 12) + k) - 0.5) * 0.35 });
  }
  // the hand from inside: a forearm out of the split, the fingers curled over the lip, the thumb hooked inside
  const IH = bi('inHand'), F1 = bi('inF1'), F2 = bi('inF2'), TH = bi('inTh');
  sac(B, R('SKIN'), 4, [[0.0, 1.15, 0.4], [0.012, 1.18, 0.445], [0.02, 1.2, 0.48], [0.022, 1.205, 0.505]], [[0.03, 0.026], [0.032, 0.027], [0.03, 0.022], [0.022, 0.014]], [[SE, 1], [SE, 0.5, IH, 0.5], [IH, 1], [IH, 1]], { n: 8, up: [0, 1, 0] });
  for (let i = 0; i < 4; i++) {
    const fx = 0.022 + (i - 1.5) * 0.017, L = [1, 1.08, 1.04, 0.86][i];
    sac(B, R('SKIN'), 5 + i, [[fx, 1.207, 0.505], [fx + 0.002, 1.206, 0.5 + 0.03 * L], [fx + 0.003, 1.19, 0.5 + 0.055 * L], [fx + 0.003, 1.16, 0.5 + 0.062 * L]], [[0.0085, 0.0075], [0.008, 0.007], [0.0072, 0.0065], [0.004, 0.004]], [[IH, 1], [F1, 1], [F1, 0.4, F2, 0.6], [F2, 1]], { n: 6 });
  }
  sac(B, R('SKIN'), 9, [[-0.002, 1.19, 0.49], [-0.022, 1.19, 0.51], [-0.034, 1.18, 0.522]], [[0.01, 0.009], [0.009, 0.008], [0.005, 0.005]], [[IH, 1], [TH, 1], [TH, 1]], { n: 6 });
  // ---- neck
  sac(B, R('NECK'), 10, [[0, 1.55 * s, -0.01], [0, 1.64 * s, 0.03], [0, 1.73 * s, 0.07], [0, 1.8 * s, 0.09]], [[0.19, 0.19], [0.175, 0.18], [0.17, 0.175], [0.165, 0.17]], [[CH, 1], [CH, 0.4, bi('neck'), 0.6], [bi('neck'), 0.6, bi('head'), 0.4], [bi('head'), 1]], { n: 14, start: false, end: false, up: [0, 0, 1] });
  // ---- the head: a big soft dome, a duck bill, a lower bill that drops, the mesh behind the grin
  const HD = bi('head'), JW = bi('jaw');
  const hp = x.rest('head');
  headLoft(B, { at: hp, rows: HEAD, reg: R('HEAD'), vr: R('HEAD').range, w: () => [HD, 1], g: 11, top: 0.285, bottom: -0.15, s,
    bump: (th, y) => 0.06 * Math.exp(-((y - 0.11) ** 2) / 0.003) * Math.exp(-((Math.abs(th) - 0.55) ** 2) / 0.05) - 0.03 * Math.exp(-(y * y) / 0.002) * Math.exp(-(th * th) / 0.2) });
  const by = hp[1] + 0.03 * s;
  const ub: V3[] = [[0, by, 0.12], [0, by - 0.005, 0.3], [0, by - 0.012, 0.46], [0, by - 0.02, 0.56], [0, by - 0.022, 0.6]];
  sac(B, R('BILL'), 12, ub, [[0.19, 0.08], [0.195, 0.064], [0.185, 0.052], [0.155, 0.04], [0.09, 0.03]], ub.map(() => [HD, 1]), { n: 16, up: [0, 1, 0], bump: (a, t) => 0.04 * Math.sin(a * 2) * t });
  const jy = hp[1] - 0.035 * s;
  const lb: V3[] = [[0, jy, 0.14], [0, jy - 0.01, 0.3], [0, jy - 0.012, 0.44], [0, jy - 0.012, 0.52], [0, jy - 0.01, 0.55]];
  sac(B, R('JAW'), 13, lb, [[0.165, 0.055], [0.17, 0.05], [0.16, 0.04], [0.13, 0.03], [0.07, 0.022]], lb.map(() => [JW, 1]), { n: 14, up: [0, 1, 0] });
  // the mesh window the performer looked out of, set back in the gap between the bills (seen when the jaw drops)
  plate(B, R('MESH'), 14, [0, hp[1] - 0.005, 0.2], [1, 0, 0], [0, 1, 0], 0.13, 0.045, 0.02, [HD, 1], { rows: 3, cols: 6, oval: 0.4 });
  // ---- googly eyes: plastic domes with pupils loose behind the plastic
  for (const [sd, k] of SIDES) {
    const e = x.rest('eye' + sd), out: V3 = [k * 0.42, 0.12, 0.9];
    const L = Math.hypot(out[0], out[1], out[2]), o: V3 = [out[0] / L, out[1] / L, out[2] / L];
    const at = (d: number): V3 => [e[0] + o[0] * d, e[1] + o[1] * d, e[2] + o[2] * d];
    sac(B, R('EYE'), 15, [at(-0.02), at(0.02), at(0.06)], [[0.085, 0.085], [0.088, 0.088], [0.055, 0.055]], [[HD, 1], [HD, 1], [HD, 1]], { n: 12, up: [0, 1, 0] });
    const pc = x.rest('pup' + sd), right: V3 = [o[2], 0, -o[0]], up: V3 = [-o[0] * o[1], o[0] * o[0] + o[2] * o[2], -o[2] * o[1]];
    plate(B, R('PUP'), 16, [pc[0] + o[0] * 0.012, pc[1] + o[1] * 0.012, pc[2] + o[2] * 0.012], right, up, 0.032, 0.036, 0.008, [bi('pup' + sd), 1], { rows: 3, cols: 4 });
    // a felt brow over each eye, stuck on crooked
    sac(B, R('PLATE'), 17, [[k * 0.06, e[1] + 0.085, e[2] + 0.02], [k * 0.13, e[1] + 0.105 + (k > 0 ? 0.01 : -0.005), e[2] + 0.035], [k * 0.2, e[1] + 0.085, e[2] + 0.0]], [[0.012, 0.018], [0.014, 0.022], [0.01, 0.014]], [[HD, 1], [HD, 1], [HD, 1]], { n: 6, up: [0, 0, 1] });
  }
  // ---- the crest: a curved teal horn of felt over the skull
  const CR = bi('crest');
  const cp: V3[] = [[0, 1.96 * s, 0.14], [0, 2.07 * s, 0.05], [0, 2.12 * s, -0.08], [0, 2.1 * s, -0.22], [0, 2.02 * s, -0.33]];
  sac(B, R('CREST'), 18, cp, [[0.045, 0.06], [0.05, 0.085], [0.048, 0.09], [0.04, 0.075], [0.022, 0.035]], [[HD, 1], [CR, 1], [CR, 1], [CR, 1], [CR, 1]], { n: 10, up: [1, 0, 0] });
  // ---- arms with a felt mitt each, four fat fingers and claws
  for (const [sd, k] of SIDES) {
    chain(B, x, R('ARM'), 20 + (k > 0 ? 0 : 1), { bones: ['uarm' + sd, 'farm' + sd, 'hand' + sd], tip: x.rest('hand' + sd), r: [0.115, 0.085], n: 10, rings: 4, knuckle: 0.08, start: true, end: false,
      bump: (a, t) => 0.04 * Math.sin(a * 4 + t * 20) });
    const hp2 = x.rest('hand' + sd);
    handLoft(B, { k, at: [hp2[0], hp2[1] + 0.02, hp2[2]], bones: { farm: bi('farm' + sd), hand: bi('hand' + sd), f1: bi('fing1' + sd), f2: bi('fing2' + sd), thumb: bi('thumb' + sd) }, reg: R('MITT'), g: 22 + (k > 0 ? 0 : 10), s: 1.55,
      palm: { len: 0.09, w: 0.05, t: 0.026 }, fingers: { n: 3, len: [0.07, 0.078, 0.068], r: [0.016, 0.017, 0.016], spread: 1.05 }, thumb: { len: 0.06, r: 0.017 }, glove: 0.006 });
    const W1: Wt = [bi('fing2' + sd), 1];
    for (let i = 0; i < 3; i++) {
      const fz = hp2[2] + (0.5 - i / 2) * 0.05 * 1.3 * 1.05 * 1.55 + 0.002;
      const ty = hp2[1] + 0.02 - (0.09 * 0.92 + [0.07, 0.078, 0.068][i]) * 1.55;
      sac(B, R('CLAW'), 40 + i + (k > 0 ? 0 : 3), [[hp2[0], ty + 0.02, fz], [hp2[0] + k * 0.004, ty - 0.012, fz + 0.01], [hp2[0] + k * 0.006, ty - 0.03, fz + 0.022]], [[0.012, 0.01], [0.008, 0.007], [0.002, 0.002]], [W1, W1, W1], { n: 5 });
    }
  }
  // ---- legs into big foam feet with three toes
  for (const [sd, k] of SIDES) {
    chain(B, x, R('LEG'), 50 + (k > 0 ? 0 : 1), { bones: ['thigh' + sd, 'shin' + sd, 'foot' + sd], tip: x.rest('foot' + sd), r: (t) => 0.17 - t * 0.045 + 0.02 * Math.sin(t * Math.PI), n: 12, rings: 4, knuckle: 0.05, start: true, end: false });
    const fp = x.rest('foot' + sd), FT: Wt = [bi('foot' + sd), 1];
    footLoft(B, { k, at: fp, rows: FOOT_BARE, ground: -0.12, sole: 0.02, lip: 0.004, reg: R('FOOT'), w: FT, g: 52 + (k > 0 ? 0 : 1), s: 2.1, sx: 1.55, toeLift: 0.15 });
    for (let i = -1; i <= 1; i++) {
      const tx = fp[0] + i * 0.075, tz = fp[2] + 0.34 - Math.abs(i) * 0.04;
      sac(B, R('FOOT'), 54 + i + 1 + (k > 0 ? 0 : 3), [[tx, fp[1] - 0.06, tz - 0.06], [tx + i * 0.01, fp[1] - 0.07, tz + 0.03], [tx + i * 0.015, fp[1] - 0.085, tz + 0.08]], [[0.05, 0.042], [0.045, 0.036], [0.026, 0.022]], [FT, FT, FT], { n: 8 });
      sac(B, R('TOE'), 60 + i + 1 + (k > 0 ? 0 : 3), [[tx + i * 0.015, fp[1] - 0.088, tz + 0.085], [tx + i * 0.02, fp[1] - 0.098, tz + 0.12], [tx + i * 0.022, fp[1] - 0.108, tz + 0.142]], [[0.02, 0.014], [0.013, 0.009], [0.003, 0.003]], [FT, FT, FT], { n: 5 });
    }
  }
  // ---- the tail, dragging, with plates; plates up the spine too
  chain(B, x, R('TAIL'), 70, { bones: ['tail0', 'tail1', 'tail2', 'tail3'], tip: x.rest('tail4'), r: (t) => 0.25 * Math.pow(1 - t, 0.8) + 0.025, flat: 0.86, n: 12, rings: 4, start: true, end: true, up: [1, 0, 0],
    bump: (a, t) => 0.03 * Math.sin(a * 5 + t * 30) });
  const spine: [V3, V3, string, number][] = [
    [[0, 1.62 * s, -0.17], [0, 0.4, -0.9], 'chest', 0.1], [[0, 1.5 * s, -0.26], [0, 0.45, -0.89], 'chest', 0.13], [[0, 1.36 * s, -0.31], [0, 0.35, -0.94], 'chest', 0.15], [[0, 1.2, -0.37], [0, 0.25, -0.97], 'hips', 0.16],
    [[0, 1.04, -0.42], [0, 0.4, -0.92], 'tail0', 0.15], [[0, 0.93, -0.62], [0, 0.85, -0.53], 'tail1', 0.14], [[0, 0.72, -0.84], [0, 0.88, -0.48], 'tail2', 0.12], [[0, 0.48, -1.07], [0, 0.92, -0.4], 'tail2', 0.1], [[0, 0.3, -1.3], [0, 0.95, -0.32], 'tail3', 0.08],
  ];
  spine.forEach(([p, up, bone, h], i) => {
    const tip: V3 = [p[0], p[1] + up[1] * h, p[2] + up[2] * h], mid: V3 = [p[0], p[1] + up[1] * h * 0.55, p[2] + up[2] * h * 0.55];
    const fw: V3 = [0, -up[2], up[1]];
    const w: Wt = [bi(bone), 1];
    blade(B, R('PLATE'), [p, mid, tip], [h * 0.95, h * 0.62, 0.0], fw, [w, w, w], { offset: -0.5, seed: i + 1, edge: 0.15 });
  });
}

// ------------------------------------------------------------------ the paint
const PAL = [
  { fur: 0xd8823c, cream: 0xead2a0, teal: 0x3a9a8c, spot: 0x2f7f76 },
  { fur: 0xd2a232, cream: 0xeedcae, teal: 0xb8482e, spot: 0x9a3a26 },
];
function paintDooley(p: Page, x: BuildCtx) {
  const v = x.variant % 2, C = PAL[v], sd = x.seed % 997;
  const FUR = makeRamp(C.fur, 9, { hueShift: 0.03, spread: 0.62 }), CREAM = makeRamp(C.cream, 8, { hueShift: 0.02, spread: 0.5 }), TEAL = makeRamp(C.teal, 7, { spread: 0.55 });
  const BLOOD = makeRamp(0x7a0c0c, 6, { spread: 0.7, hueShift: 0.01 }), FLESH = makeRamp(0xb83c3c, 8, { hueShift: 0.03, spread: 0.65 }), DIRT = makeRamp(0x5a4630, 5, { spread: 0.5 });
  const GREY = 0x6a5a4a;
  // torso: orange plush, the cream belly, teal spots on the back, grime round the hem, the seam
  const T = p.R('TORSO');
  paintPlush(T, FUR, { seed: sd + 1, matted: 6 });
  T.fill(CREAM, (xx, yy) => 4.2 + 0.8 * Math.cos((T.deg(xx) * Math.PI) / 180) + (T.fbm(xx, yy, 4, 2, sd + 2) - 0.5) * 1.1 + (hash(xx, (yy >> 1) + sd) - 0.5) * 0.5,
    (xx, yy) => { const d = T.deg(xx), vv = 1 - yy / T.h; const e = Math.abs(d) / 56 + Math.abs(vv - 0.42) / 0.36 * 0.6; return e < 1 + (hash(xx >> 1, yy >> 1) - 0.5) * 0.08; }, 0.5);
  for (let i = 0; i < 16; i++) {
    const a = 115 + hash(i, sd + 3) * 130, vv = 0.15 + hash(i, sd + 4) * 0.75;
    T.blob(T.X(a > 180 ? a - 360 : a), T.Y(T.range[0] + vv * (T.range[1] - T.range[0])), 2.5 + hash(i, 5) * 3, 2 + hash(i, 6) * 2.5, TEAL[2 + (i % 3)], 1.1);
  }
  for (let yy = Math.floor(T.h * 0.82); yy < T.h; yy++) for (let xx = 0; xx < T.w; xx++) if (hash(xx, yy + sd) < (yy / T.h - 0.82) * 4.5) T.blend(xx, yy, DIRT[1 + (xx & 1)], 0.45);
  for (let i = 0; i < 5; i++) T.glow(T.X(-40 + hash(i, sd + 7) * 80), T.h * (0.78 + hash(i, 8) * 0.15), 3 + hash(i, 9) * 4, 2, 0x5a7a2a, 0.35);   // grass stains on the belly hem
  // the seam: a jagged split down the front, threads snapped across it, soaked and running
  const sx = T.X(0), sy0 = T.Y(1.31), sy1 = T.Y(0.87);
  soak(T, sx, (sy0 + sy1) / 2, 11, (sy1 - sy0) * 0.62, BLOOD, sd + 9);
  for (let yy = Math.floor(sy0); yy <= sy1; yy++) {
    const t = (yy - sy0) / (sy1 - sy0), w = 1 + Math.sin(t * Math.PI) * 3.2 + (hash(yy, sd) - 0.5) * 1.5, off = Math.sin(yy * 0.7 + sd) * 0.8;
    for (let xx = -Math.ceil(w); xx <= Math.ceil(w); xx++) {
      const e = Math.abs(xx) / w;
      if (e > 1) continue;
      T.set(sx + xx + off, yy, e < 0.45 ? 0x140404 : e < 0.75 ? BLOOD[1] : FLESH[3 + (hash(xx, yy) < 0.4 ? 1 : 0)]);
    }
    if (yy % 3 === 0 && hash(yy, sd + 5) < 0.6) { const L = w + 2 + hash(yy, 2) * 3; T.hline(sx - L, sx - w - 0.5, yy + 0.5, 0xe8dcc0, 0.75); T.hline(sx + w + 0.5, sx + L * 0.7, yy - 0.5, 0xe8dcc0, 0.6); }
  }
  runs(T, sx - 1, sy1, 4, T.h - sy1, BLOOD, sd + 11, 1);
  stitches(T, T.X(-58), T.Y(1.5), T.X(58), T.Y(1.5), mixHex(C.fur, 0x000000, 0.45), 0xf0e4c8, 4);   // the neckline seam of the cream bib
  // head: plush dome, the stitched grin running up from the bill corners into the cheeks, rosy felt cheeks
  const Hd = p.R('HEAD');
  paintPlush(Hd, FUR, { seed: sd + 13, matted: 2 });
  for (const k of [1, -1]) {
    const cx = Hd.X(k * 66), cy = Hd.Y(0.05);
    Hd.ellipse(cx, cy - 6, 4.5, 3.4, mixHex(0xe87a8a, C.fur, 0.25), 0.85);
    for (let i = 0; i < 9; i++) { const t = i / 8; Hd.blend(Hd.X(k * (38 + t * 34)), Hd.Y(0.0 + t * t * 0.07), 0x1a0c08, 0.95); Hd.blend(Hd.X(k * (38 + t * 34)), Hd.Y(0.0 + t * t * 0.07) + 1, 0x3a1a10, 0.6); }
  }
  for (let i = 0; i < 6; i++) Hd.glow(hash(i, sd + 14) * Hd.w, Hd.h * (0.2 + hash(i, 15) * 0.6), 3, 2, TEAL[3], 0.4);
  // bills: pale felt with nostrils; the grin's felt teeth along the lip; the mouth between them black
  const Bl = p.R('BILL');
  paintFelt(Bl, CREAM, sd + 16, 4.6);
  for (let yy = 0; yy < Bl.h; yy++) for (let xx = 0; xx < Bl.w; xx++) {
    const u = xx / Bl.w, under = u < 0.12 || u > 0.88, tooth = (u > 0.12 && u < 0.3) || (u > 0.7 && u < 0.88);
    if (under) Bl.set(xx, yy, 0x1a0808);
    else if (tooth && yy < Bl.h * 0.92) { const ph = (yy % 5) / 5, tu = u < 0.5 ? (0.3 - u) / 0.18 : (u - 0.7) / 0.18; if (tu < 1 - Math.abs(ph - 0.5) * 1.6) Bl.set(xx, yy, ph < 0.15 || ph > 0.85 ? 0xb8b0a0 : 0xf6f2e6); }
  }
  for (const u of [0.42, 0.58]) Bl.ellipse(u * Bl.w, Bl.h * 0.86, 1.4, 1.1, 0x3a2a1a, 0.95);
  const Jw = p.R('JAW');
  paintFelt(Jw, CREAM, sd + 17, 4.2);
  for (let yy = 0; yy < Jw.h; yy++) for (let xx = 0; xx < Jw.w; xx++) {
    const u = xx / Jw.w;
    if (u > 0.3 && u < 0.7) Jw.set(xx, yy, (u > 0.38 && u < 0.62) ? FLESH[2 + ((xx + yy) % 4 === 0 ? 1 : 0)] : 0x1a0808);
    else if ((u > 0.2 && u <= 0.3) || (u >= 0.7 && u < 0.8)) { const ph = (yy % 5) / 5; if (Math.abs(ph - 0.5) < 0.38) Jw.set(xx, yy, 0xf4f0e2); }
  }
  // the mesh and the eye behind it
  const M = p.R('MESH');
  for (let yy = 0; yy < M.h; yy++) for (let xx = 0; xx < M.w; xx++) {
    const ex = (xx + 0.5 - M.w * 0.55) / 4.6, ey = (yy + 0.5 - M.h * 0.5) / 3.2, d = Math.hypot(ex, ey);
    let c = 0x0e0a0a;
    if (Math.hypot((xx - M.w * 0.55) / 9, (yy - M.h / 2) / 5) < 1) c = mixHex(0xc89a84, 0x6a4a3e, Math.min(1, Math.hypot((xx - M.w * 0.55) / 9, (yy - M.h / 2) / 5)));
    if (d < 1) c = d < 0.34 ? 0x0a0604 : d < 0.62 ? 0x5a3a1c : hash(xx, yy) < 0.3 ? 0xd06a5a : 0xe8dcd0;
    if ((xx + yy) % 2 === 0) c = mixHex(c, 0x000000, 0.55);
    M.set(xx, yy, c);
  }
  M.set(M.w * 0.55 - 1, M.h / 2 - 1, 0xffffff);
  // neck, arms, legs, tail: plush; the tail's belly cream; grime and blood on the legs and feet
  paintPlush(p.R('NECK'), FUR, { seed: sd + 18 });
  stitches(p.R('NECK'), 0, p.R('NECK').h - 2, p.R('NECK').w, p.R('NECK').h - 2, mixHex(C.fur, 0, 0.4), 0xe8dcc0, 3);
  paintPlush(p.R('ARM'), FUR, { seed: sd + 19, matted: 2 });
  const Lg = p.R('LEG');
  paintPlush(Lg, FUR, { seed: sd + 20, matted: 3 });
  for (let yy = Math.floor(Lg.h * 0.6); yy < Lg.h; yy++) for (let xx = 0; xx < Lg.w; xx++) if (hash(xx, yy + sd) < (yy / Lg.h - 0.6) * 2.2) Lg.blend(xx, yy, DIRT[2], 0.5);
  for (let i = 0; i < 6; i++) Lg.blob(hash(i, sd + 21) * Lg.w, Lg.h * (0.3 + hash(i, 22) * 0.6), 1.5, 2.5, BLOOD[2], 0.9);
  const Tl = p.R('TAIL');
  paintPlush(Tl, FUR, { seed: sd + 23 });
  for (let yy = 0; yy < Tl.h; yy++) for (let xx = 0; xx < Tl.w; xx++) { const u = xx / Tl.w; if (u < 0.2 || u > 0.8) Tl.put(xx, yy, CREAM, 3.6 + (hash(xx, yy) - 0.5) * 0.8 - (yy / Tl.h) * 0.8, 0.5); }
  for (let yy = Math.floor(Tl.h * 0.55); yy < Tl.h; yy++) for (let xx = 0; xx < Tl.w; xx++) { const u = xx / Tl.w; if ((u < 0.28 || u > 0.72) && hash(xx, yy) < 0.6) Tl.blend(xx, yy, DIRT[1], 0.5); }
  for (let i = 0; i < 9; i++) Tl.blob(Tl.w * (0.3 + hash(i, sd + 24) * 0.4), hash(i, 25) * Tl.h, 2, 2, TEAL[3], 1);
  const Mt = p.R('MITT');
  paintPlush(Mt, FUR, { seed: sd + 26, pile: 0.4 });
  for (let yy = 0; yy < Mt.h; yy++) for (let xx = 0; xx < Mt.w; xx++) if (Math.abs(Mt.deg(xx) - 90) < 50 || Math.abs(Mt.deg(xx) + 90) < 50) Mt.put(xx, yy, CREAM, 3.4 + (hash(xx, yy) - 0.5) * 0.6, 0.5);
  for (let i = 0; i < 4; i++) Mt.blob(hash(i, sd + 27) * Mt.w, Mt.h * (0.5 + hash(i, 28) * 0.5), 1.6, 1.6, BLOOD[1], 0.9);
  const Ft = p.R('FOOT');
  paintPlush(Ft, FUR, { seed: sd + 29, pile: 0.5 });
  for (let yy = 0; yy < Ft.h; yy++) for (let xx = 0; xx < Ft.w; xx++) { if (Math.abs(Ft.deg(xx)) > 92) Ft.put(xx, yy, DIRT, 1.6 + (hash(xx, yy) - 0.5), 0.6); else if (hash(xx, yy + sd) < 0.12) Ft.blend(xx, yy, DIRT[2], 0.5); }
  paintFelt(p.R('TOE'), CREAM, sd + 30, 5);
  paintFelt(p.R('CLAW'), CREAM, sd + 31, 5.5);
  const Cr = p.R('CREST');
  paintFelt(Cr, TEAL, sd + 32, 3.6);
  stitches(Cr, Cr.w / 2, 0, Cr.w / 2, Cr.h, TEAL[0], mixHex(C.teal, 0xffffff, 0.5), 3);
  const Pl = p.R('PLATE');
  paintFelt(Pl, TEAL, sd + 33, 3.8);
  for (let xx = 0; xx < Pl.w; xx++) { Pl.blend(xx, 0, TEAL[0], 0.7); Pl.blend(xx, Pl.h - 1, TEAL[0], 0.5); }
  // googly eyes
  const Ey = p.R('EYE');
  Ey.fill(makeRamp(0xf4f2ec, 5, { spread: 0.25 }), (xx, yy) => 3 + Math.cos((Ey.deg(xx) * Math.PI) / 180) * 1.2 - (yy / Ey.h) * 0.6);
  Ey.ellipse(Ey.w * 0.42, Ey.h * 0.3, 1.6, 1.2, 0xffffff, 0.95);
  for (let xx = 0; xx < Ey.w; xx++) Ey.blend(xx, Ey.h - 1, GREY, 0.6);
  p.R('PUP').fill(makeRamp(0x161414, 3), (xx, yy) => 1 + (xx === 2 && yy === 2 ? 2 : 0));
  // the inside: wet, ribbed meat with fat; the hand grey and filthy, the nails black
  const Fl = p.R('FLESH');
  paintSkin(Fl, FLESH, { seed: sd + 34, veins: 7, vein: BLOOD[1], mottle: 2.2, glint: 14 });
  for (let yy = 2; yy < Fl.h; yy += 5) for (let xx = 0; xx < Fl.w; xx++) { Fl.blend(xx, yy, FLESH[6], 0.5); Fl.blend(xx, yy + 1, BLOOD[1], 0.45); }
  for (let i = 0; i < 6; i++) Fl.blob(hash(i, sd + 35) * Fl.w, hash(i, 36) * Fl.h, 1.4, 1.2, 0xe8cc7a, 0.9);
  const Lp = p.R('LIP');
  paintPlush(Lp, FUR, { seed: sd + 37, pile: 0.8 });
  for (let yy = 0; yy < Lp.h; yy++) for (let xx = 0; xx < Lp.w; xx++) if (hash(xx, yy) < 0.5) Lp.blend(xx, yy, BLOOD[2], 0.55);
  const Sk = p.R('SKIN');
  paintSkin(Sk, makeRamp(0xb8a094, 7, { spread: 0.5 }), { seed: sd + 38, veins: 4, vein: 0x6a5a7a, mottle: 1.6 });
  for (let xx = 0; xx < Sk.w; xx++) { Sk.set(xx, Sk.h - 1, 0x2a1a14); Sk.blend(xx, Sk.h - 2, 0x3a2418, 0.7); }
  for (let i = 0; i < 4; i++) Sk.blob(hash(i, sd + 39) * Sk.w, hash(i, 40) * Sk.h, 1.6, 1.6, BLOOD[2], 0.9);
  paintCap(p.R('CAP'), C.fur, FLESH[3], BLOOD[1]);
}

const DOOLEY_KIT: KitDef = { key: 'pg_dooley', variants: 2, W: 256, H: 256, bones: bonesDooley, layout: layoutDooley, build: buildDooleyMesh, paint: paintDooley, sphere: [0, 1.1, -0.2, 1.7] };
/** a Dooley rig (variant 0: tangerine and teal; 1: sun-faded mustard and brick) */
export function buildDooley(variant = 0): KitRig { return buildKitRig(DOOLEY_KIT, variant, 2.05); }

// ------------------------------------------------------------------ animation
export type DooleyPose = 'idle' | 'walk' | 'run' | 'wave' | 'dance' | 'bow' | 'hug' | 'squeeze' | 'dead';
interface DooleyDrive { t: number; dt: number; speed: number; md: string; mdT: number; atk: number; flinch: number; dead: number; split: number; seed: number; yaw: number; pitch: number }
const LIMBS = ['hips', 'belly', 'chest', 'neck', 'head', 'jaw', 'crest', 'uarmL', 'farmL', 'handL', 'fing1L', 'fing2L', 'thumbL', 'uarmR', 'farmR', 'handR', 'fing1R', 'fing2R', 'thumbR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'tail0', 'tail1', 'tail2', 'tail3', 'inHand', 'inF1', 'inF2', 'inTh', 'seam'];
function poseDooleyRig(K: KitRig, d: DooleyDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, s7 = d.seed * 7;
  for (const n of LIMBS) P[n]?.rotation.set(0, 0, 0);
  for (const n of ['hips', 'inHand', 'seam']) { const o = P[n]; if (o?.userData.p0) o.position.copy(o.userData.p0); }
  P.base.rotation.set(0, 0, 0); P.base.position.set(0, 0, 0);
  const run = d.md === 'hug' ? 1 : 0;
  const mv = Math.min(1, d.speed / (run ? 2.6 : 0.8)) * (1 - d.dead);
  ud.ph = (ud.ph ?? 0) + d.dt * (run ? 7.5 : 4.6) * Math.min(1.4, d.speed / (run ? 2.6 : 0.8) + 0.05);
  const g = gait(P, { ph: ud.ph, mv, stride: run ? 0.75 : 0.42, knee: run ? 1.1 : 0.6, arm: run ? 0.2 : 0.35, bounce: run ? 0.07 : 0.05, waddle: run ? 0.08 : 0.16 });
  P.hips.position.y += g.bob;
  P.hips.rotation.z = g.sway; P.chest.rotation.z = -g.sway * 0.6;
  const breathe = Math.sin(t * 1.6 + s7);
  P.belly.rotation.x = breathe * 0.02 + g.bob * 0.8; P.belly.scale?.setScalar(1 + breathe * 0.012);
  // tail: lags behind the hips, swishes
  const sw = Math.sin(t * 1.3 + s7) * 0.12 + g.sway * -1.4;
  P.tail0.rotation.set(0.05, sw * 0.5, 0); P.tail1.rotation.set(-0.04, sw * 0.6, 0); P.tail2.rotation.set(-0.06, sw * 0.7, 0); P.tail3.rotation.set(-0.02, sw * 0.8, 0);
  // the head: a fixed grin; it looks where it is told; the crest flops
  P.neck.rotation.set(0.05 + d.pitch * 0.4, d.yaw * 0.4, 0);
  P.head.rotation.set(d.pitch * 0.6 - 0.04, d.yaw * 0.6, Math.sin(t * 0.7 + s7) * 0.06);
  P.crest.rotation.set(Math.sin(t * 2.1) * 0.03 - g.bob, 0, Math.sin(t * 1.7 + 1) * 0.04);
  let jaw = 0.02;
  const mT = d.mdT;
  // ---- the show
  if (d.md === 'wave') {
    const w = Math.sin(t * 7);
    P.uarmR.rotation.set(-0.3, 0, -2.5); P.farmR.rotation.set(-0.2, 0, -0.35 + w * 0.45); P.handR.rotation.set(0, 0, w * 0.3);
    P.uarmL.rotation.set(0.1, 0, 0.25); P.hips.rotation.z += Math.sin(t * 3.5) * 0.05; P.head.rotation.z += Math.sin(t * 3.5) * 0.12;
  } else if (d.md === 'dance' || d.md === 'show') {
    // stomp (left), stomp (right), clap clap overhead, wiggle and spin
    const beat = (mT / 0.62) % 4, bi = Math.floor(beat), bt = beat - bi;
    const up = Math.sin(Math.min(1, bt * 1.6) * Math.PI);
    if (bi === 0 || bi === 1) {
      const sd = bi === 0 ? 'L' : 'R', k = bi === 0 ? 1 : -1;
      P['thigh' + sd].rotation.x = -0.9 * up; P['shin' + sd].rotation.x = 1.3 * up; P['foot' + sd].rotation.x = -0.4 * up;
      P.hips.rotation.z = -k * 0.08 * up; P.hips.position.y += 0.03 * up;
      for (const [s2, k2] of SIDES) { P['uarm' + s2].rotation.set(-0.4, 0, k2 * (0.9 + 0.3 * up)); P['farm' + s2].rotation.set(-1.2, 0, 0); }
    } else if (bi === 2) {
      const c = Math.abs(Math.sin(bt * Math.PI * 2));
      for (const [s2, k2] of SIDES) { P['uarm' + s2].rotation.set(-2.6, 0, k2 * (0.35 + c * 0.35)); P['farm' + s2].rotation.set(-0.3, 0, -k2 * 0.5); }
      P.hips.position.y += 0.04 * c; P.head.rotation.x -= 0.2;
    } else {
      const wig = Math.sin(bt * Math.PI * 6);
      P.hips.rotation.z = wig * 0.14; P.chest.rotation.z = -wig * 0.1; P.base.rotation.y = bt * Math.PI * 2;
      for (const [s2, k2] of SIDES) { P['uarm' + s2].rotation.set(-0.6, 0, k2 * 0.8); P['farm' + s2].rotation.set(-1.4, 0, 0); }
      P.tail1.rotation.y += wig * 0.4; P.tail2.rotation.y += wig * 0.5;
    }
    P.head.rotation.z += Math.sin(mT * 5) * 0.1;
  } else if (d.md === 'bow') {
    const b = Math.sin(Math.min(1, mT / 0.6) * Math.PI * 0.5) * (mT > 1.6 ? Math.max(0, 1 - (mT - 1.6) * 2) : 1);
    P.hips.rotation.x = 0.45 * b; P.chest.rotation.x = 0.35 * b; P.head.rotation.x += 0.3 * b;
    P.uarmR.rotation.set(-1.0 * b, 0, -0.4); P.farmR.rotation.set(-1.4 * b, 0, 0);
    P.uarmL.rotation.set(0.3 * b, 0, 0.9 * b);
  } else if (d.md === 'hug') {
    for (const [s2, k2] of SIDES) { P['uarm' + s2].rotation.set(-1.35 + Math.sin(t * 9 + k2) * 0.08, 0, k2 * 0.75); P['farm' + s2].rotation.set(-0.35, 0, 0); P['fing1' + s2].rotation.x = 0.3; }
    P.hips.rotation.x += 0.18; P.chest.rotation.x += 0.12; jaw = 0.18;
  } else if (d.md === 'squeeze') {
    const c = Math.min(1, mT / 0.35);
    for (const [s2, k2] of SIDES) { P['uarm' + s2].rotation.set(-1.25, 0, k2 * (0.75 - c * 0.95)); P['farm' + s2].rotation.set(-0.5 - c * 0.9, k2 * c * 0.4, 0); P['fing1' + s2].rotation.x = 0.9 * c; P['fing2' + s2].rotation.x = 0.8 * c; }
    P.hips.rotation.x += 0.1; P.chest.rotation.x += 0.08 + Math.sin(t * 22) * 0.02 * c; jaw = 0.32;
  }
  if (d.atk > 0) { for (const [s2, k2] of SIDES) { P['uarm' + s2].rotation.x = -1.3 - d.atk * 0.3; P['uarm' + s2].rotation.z = k2 * (0.8 - d.atk * 1.0); } jaw = Math.max(jaw, 0.25 * d.atk); }
  // the jaw drops a little when it is hurt or hugging: the mesh shows, and the eye in it
  jaw = Math.max(jaw, d.split * 0.12, d.flinch * 0.3);
  P.jaw.rotation.x = jaw + Math.sin(t * 13) * 0.01 * d.split;
  // ---- googly pupils: little springs that lag the head
  for (const [s2, k2] of SIDES) {
    const tx = Math.sin(t * 2.3 + k2) * 0.004 - g.sway * 0.03, ty = -g.bob * 0.4 - 0.004;
    const vx = (ud['gx' + s2] ?? 0), vy = (ud['gy' + s2] ?? 0);
    const ax = (tx - vx) * 140 - (ud['gvx' + s2] ?? 0) * 6, ay = (ty - vy) * 140 - (ud['gvy' + s2] ?? 0) * 6;
    ud['gvx' + s2] = (ud['gvx' + s2] ?? 0) + ax * d.dt; ud['gvy' + s2] = (ud['gvy' + s2] ?? 0) + ay * d.dt;
    let nx = vx + ud['gvx' + s2] * d.dt, ny = vy + ud['gvy' + s2] * d.dt;
    const L = Math.hypot(nx, ny); if (L > 0.026) { nx *= 0.026 / L; ny *= 0.026 / L; }
    ud['gx' + s2] = nx; ud['gy' + s2] = ny;
    const pp = P['pup' + s2]; if (pp?.userData.p0) pp.position.set(pp.userData.p0.x + nx * k2, pp.userData.p0.y + ny, pp.userData.p0.z);
  }
  // ---- the inside: the bulge breathes and pushes; the hand grips and lets go
  const push = 0.3 + d.split * 0.7;
  const grip = 0.5 + 0.5 * Math.sin(t * 0.9 + s7) * Math.sin(t * 2.7);
  if (P.seam?.userData.p0) P.seam.position.z = P.seam.userData.p0.z + (breathe * 0.006 + Math.max(0, Math.sin(t * 0.43 + s7)) * 0.02) * push;
  P.seam.scale.set(1 + d.split * 0.4 + breathe * 0.04, 1 + d.split * 0.15, 1 + d.split * 0.6 + Math.max(0, Math.sin(t * 0.43)) * 0.2);
  if (P.inHand?.userData.p0) P.inHand.position.z = P.inHand.userData.p0.z + d.split * 0.04 - 0.01 * grip;
  P.inHand.rotation.set(-0.2 * grip, Math.sin(t * 0.6) * 0.15, 0);
  P.inF1.rotation.x = 0.2 + grip * 0.5 + d.flinch * 0.6; P.inF2.rotation.x = 0.3 + grip * 0.5; P.inTh.rotation.y = -0.3 * grip;
  // ---- dead: it sits down hard in itself
  if (d.dead > 0) {
    const k = d.dead;
    P.hips.position.y -= 0.35 * k; P.chest.rotation.x += 0.5 * k; P.head.rotation.x += 0.6 * k; P.jaw.rotation.x = 0.45 * k;
    for (const [s2, k2] of SIDES) { P['uarm' + s2].rotation.set(0.2 * k, 0, k2 * 0.5 * k); P['thigh' + s2].rotation.set(-1.2 * k, 0, k2 * 0.35 * k); P['shin' + s2].rotation.set(1.1 * k, 0, 0); }
    P.inHand.rotation.x = 0.6 * k; P.inF1.rotation.x = 1.2 * k; P.inF2.rotation.x = 1 * k;
  }
  if (d.flinch > 0) { P.chest.rotation.x -= d.flinch * 0.15; P.hips.position.x += Math.sin(t * 70) * 0.012 * d.flinch; }
}

function animateDooley(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 2);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  if (n.md !== ud.lmd) { ud.lmd = n.md; ud.mdT = 0; }
  ud.mdT = (ud.mdT ?? 0) + dt;
  const ac = attackCurve(rig, c, t);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 1.5) : 0;
  let yaw = 0, pitch = 0;
  const ns = !c.dead ? nearestSurvivor(c, 14) : null;
  if (ns) [yaw, pitch] = lookAngles(c, ns.x, ns.z, ns.y, 1.95, 0.9, 0.4);
  ud.yaw = (ud.yaw ?? 0) + (yaw - (ud.yaw ?? 0)) * Math.min(1, dt * 4); ud.pitch = (ud.pitch ?? 0) + (pitch - (ud.pitch ?? 0)) * Math.min(1, dt * 4);
  ud.split = (ud.split ?? 0) + ((n.split ?? 0) - (ud.split ?? 0)) * Math.min(1, dt * 3);
  poseDooleyRig(K, { t, dt, speed: c.dead ? 0 : c.speed, md: c.dead ? '' : (n.md ?? ''), mdT: ud.mdT, atk: Math.max(ac.wind, ac.strike), flinch: flinchOf(c), dead: ud.dk * ud.dk * (3 - 2 * ud.dk), split: ud.split, seed: hashId(c.id, 3), yaw: ud.yaw, pitch: ud.pitch });
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  // heavy soft steps; the laugh track; its lines
  if (c.speed > 0.3 && !c.dead) { ud.stp = (ud.stp ?? 0) + dt * c.speed; if (ud.stp > (n.md === 'hug' ? 1.1 : 0.8)) { ud.stp = 0; if (c.visibleToLocal) playAt('cb_stomp', c, n.md === 'hug' ? 0.4 : 0.22, 14, 0.75 + Math.random() * 0.1); } }
  linePoll(rig, c, 'DOOLEY');
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal) {
    const dd = dist(p, c);
    if (n.md === 'hug' && dd < 14) thinkOnce(p, 'dooley_hug', 'I looked away. It is running at me with its arms open. LOOK AT IT.', 40);
    else if ((n.split ?? 0) > 0.3 && dd < 8) thinkOnce(p, 'dooley_inside', 'There is a hand. Inside the costume. It is holding the seam shut from the inside.', 90);
    else if (n.md === 'dance' && dd < 16) thinkOnce(p, 'dooley_show', 'It is dancing for me. If I keep watching, it keeps dancing.', 120);
    else if (dd < 12) thinkOnce(p, 'dooley', ['A kids\' show dinosaur. A costume. It is waving at me.', 'Its belly is split open down the seam. Something in there is wet. Something in there is moving.', 'The grin is sewn on. Behind the mesh in its mouth there is an eye.'][Math.floor(t * 0.13) % 3], 100);
  }
}

// ------------------------------------------------------------------ host brain: the show must go on
const NUMBERS = [
  'Stomp your feet! Clap your claws! Wiggle-wiggle, that\'s the Dooley cause!',
  'Who\'s my very best friend? You are! You are! You ARE!',
  'Let\'s count our toes! One, two, three! Why don\'t YOU have three?',
  'Big hug, little hug, Dooley hug for you! Nobody leaves till the song is through!',
  'The Dino Den is open! The door is shut! We\'re all friends here, friend!',
];
const BOWS = ['Thank you! Thank you! Don\'t go anywhere!', 'Stay right there, friend! There\'s more!', 'You\'re the best audience in the whole Den!', 'Eyes on Dooley! Here comes another one!'];
const OVER = ['Aww. Is the show over? Then it\'s HUG TIME!', 'You looked away, friend. That\'s okay. Dooley\'s coming!', 'No-no-no. Eyes on Dooley. EYES ON DOOLEY.', 'Show\'s over! Everybody gets a hug!'];
const BACK = ['There you are! On with the show!', 'Oh! You came back! Places, everybody!'];
const INSIDE = ['Please. I can\'t get it off.', 'It\'s so hot in here. Don\'t let it hug you.', 'Is it still filming? Tell them to stop filming.'];
const LEFT = ['Hey! The show\'s not over! Nobody leaves the Dino Den!', 'Where are you going, friend? Dooley\'s coming with you!'];
const SHOW_T = 7.4, BOW_T = 2.1, STEP_T = 1.8, FINALE = 4;

function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function thinkDooley(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  if (ev.hurt > 0) {
    n.split = Math.min(1, +((n.split ?? 0) + ev.hurt / 70).toFixed(3));
    m.anger = G.time + 9;
    if (rng.chance(0.5)) playAt('gore_squelch', c, 0.7, 12, 0.7);
    if (m.inside === undefined || G.time > m.inside) { m.inside = G.time + 25; say(c, 'Ow! OW! Friends don\'t hit friends!'); }
  }
  const md: string = n.md ?? '';
  const near = nearestUnit(c, 30);
  const sees = !!near && near.d < 20 && lineOfSightB(z, c.x, c.z, near.p.x, near.p.z);
  // ---- squeezing: it holds on, and something inside the suit says something
  if (md === 'squeeze') {
    stop(c); c.setState('attack');
    if (m.mdT > 1.7) setMd(c, 'hug');
    return true;
  }
  // ---- the chase: the show is over (it knows where you went for a while, even round corners)
  if (md === 'hug') {
    const tg = near?.p;
    m.lostT = sees ? 0 : (m.lostT ?? 0) + dt;
    if (!tg || m.lostT > 8) { setMd(c, ''); m.lostT = 0; m.audience = null; say(c, 'Aww. Where did everybody go?'); return true; }
    // watched again for a moment (and not right on top of it, and not angry): the show goes on
    if (sees && watching(tg, c) && near!.d > 3 && G.time > (m.anger ?? 0)) { m.backT = (m.backT ?? 0) + dt; if (m.backT > 1.1) { m.backT = 0; setMd(c, 'dance'); say(c, rng.pick(BACK)); playAt('obs_laugh', c, 0.5, 18, 1); return true; } }
    else m.backT = 0;
    c.setState('chase');
    if (near!.d < c.sp.attack!.range + tg.radius + 0.1 && c.attackT <= 0) {
      faceTo(c, tg.x, tg.z); attack(c, tg); setMd(c, 'squeeze'); playAt('gore_bone_crack', c, 0.6, 12, 0.8);
      if (rng.chance(0.45)) say(c, '(a voice from inside the suit) ' + rng.pick(INSIDE)); else say(c, 'Squeeeeeze!');
      return true;
    }
    cs.moveTo(c, z, tg.x, tg.z, c.sp.run * (0.85 + (n.split ?? 0) * 0.25), dt, 0.4);
    if (c.noiseCooldown <= 0) { playAt('hound_laugh', c, 0.55, 18, 0.7); c.noiseCooldown = 4; }
    return true;
  }
  // ---- the goodbye wave after the finale; then that unit is left alone for a while
  if (md === 'bye') { stop(c); c.setState('idle'); if (m.mdT > 3.2) { setMd(c, ''); c.goal = null; } return true; }
  // ---- an audience: the numbers, the bows, a step closer between them; leave, or look away, and it is over
  if (m.audience) { const pa = G.players.get(m.audience); if (!pa || pa.zoneKey !== c.zoneKey || pa.body.dead) m.audience = null; }
  const fresh = sees && G.time > ((m.done ?? {})[near!.p.id] ?? 0);
  if (m.audience || (fresh && near!.d < 18)) {
    const p = (m.audience ? G.players.get(m.audience) : null) ?? near!.p;
    if (!m.audience) { m.audience = p.id; m.num = 0; setMd(c, 'wave'); say(c, 'Hi-hi-HI, friend! It\'s me, Dooley! Are you ready to STOMP?'); playAt('obs_laugh', c, 0.45, 18, 1.05); m.notT = 0; }
    const angry = G.time < (m.anger ?? 0);
    const d = dist(p, c), here = p.zoneKey === c.zoneKey && !p.body.dead && d < 22 && lineOfSightB(z, c.x, c.z, p.x, p.z);
    m.notT = here && watching(p, c) ? 0 : (m.notT ?? 0) + dt;
    if (angry || m.notT > 1.5) {
      setMd(c, 'hug'); say(c, rng.pick(here ? OVER : LEFT)); playAt('dread_swell', c, 0.6, 22, 1); m.notT = 0;
      ruleShown(c);
      return true;
    }
    if (md === 'step') {
      c.setState('travel');
      const arrived = cs.moveTo(c, z, p.x, p.z, c.sp.walk * 1.4, dt, 2.2);
      if (arrived || m.mdT > STEP_T) { setMd(c, 'dance'); m.num = (m.num ?? 0) + 1; say(c, NUMBERS[(m.num + Math.floor(hashId(c.id) * 5)) % NUMBERS.length]); }
      return true;
    }
    stop(c); faceTo(c, p.x, p.z); c.setState('watch');
    if (md === 'wave' && m.mdT > 2.2) { setMd(c, 'dance'); say(c, NUMBERS[Math.floor(hashId(c.id) * 5) % NUMBERS.length]); }
    else if (md === 'dance') {
      if (m.mdT > SHOW_T) {
        // the finale: the whole show watched to the end, and it says goodbye
        if ((m.num ?? 0) >= FINALE) { setMd(c, 'bye'); say(c, 'That\'s all for today, friends! See you next time in the Dino Den!'); playAt('obs_laugh', c, 0.6, 20, 1); (m.done ??= {})[p.id] = G.time + 120; m.audience = null; return true; }
        setMd(c, 'bow'); say(c, rng.pick(BOWS)); playAt('obs_laugh', c, 0.5, 18, 0.95 + Math.random() * 0.1);
      } else if ((m.beatT ?? 0) < G.time) { m.beatT = G.time + 1.24; playAt('cb_stomp', c, 0.35, 14, 0.9); }
    } else if (md === 'bow' && m.mdT > BOW_T) setMd(c, 'step');
    else if (md !== 'wave' && md !== 'dance' && md !== 'bow') setMd(c, 'dance');
    return true;
  }
  m.audience = null;
  // ---- nobody: it wanders the playground, waves at nothing, does a number for the swings
  if (md === 'dance' || md === 'wave') { stop(c); c.setState('idle'); if (m.mdT > (md === 'dance' ? 6 : 2.5)) setMd(c, ''); return true; }
  if (md !== '') setMd(c, '');
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 22) {
    if (c.goal && rng.chance(0.35)) { setMd(c, rng.chance(0.5) ? 'wave' : 'dance'); c.goal = null; if (rng.chance(0.3)) playAt('obs_laugh', c, 0.35, 16, 1); return true; }
    c.goal = findSpot(c, { rMin: 4, rMax: 14 }) ?? cs.wanderSpot(c, z, 12);
    c.stateT = 0;
  }
  return true;
}

const DOOLEY = def({
  key: 'pg_dooley', name: 'Dooley Duckbill', code: 'PG-01 // REMNANT, COSTUME (BROADCAST-BOUND)', temperament: 'stalker', threat: 4,
  rule: { name: 'THE SHOW MUST GO ON', text: 'Once it has seen you, you are its audience. Watch the whole show: it dances five numbers, stepping closer between them, then says goodbye and leaves you be. Look away, or walk out of the show, and the show is over: it runs after you with its arms open and hugs until something breaks. Back off while you watch. Hurt it and it stops caring.', tell: 'A kids\' show dinosaur in a split costume. It is waving at me. It wants me to watch.' },
  hp: 150, walk: 0.9, run: 3.1, turn: 3.2, radius: 0.46, height: 2.1, sight: 18, fov: 1.5, hearing: 1,
  attack: { dmg: [12, 22], range: 1.3, cooldown: 2.4, kinds: ['bruise', 'fracture', 'bite'], corrupt: 0.02, knock: 0.15, grab: true },
  zones: ['playground'], weight: 1, group: [1, 1], maxPerZone: 2, diet: 'none',
  meat: [['meat_raw', 2]],
  sounds: { idle: 'obs_laugh', alert: 'hound_laugh', attack: 'gore_bone_crack', hurt: 'plush_squeak', death: 'still_choke', step: 'cb_stomp' },
  scan: {
    cls: 'Remnant / costume, broadcast-bound',
    notes: [
      'A walk-around dinosaur costume from a 1990s children\'s programme. It is still performing.',
      'The belly seam has split. Inside: wet tissue, a rib, and a human hand that grips the edge.',
      'Watched, it performs five numbers, approaching between them, then leaves. Look away or leave and it charges.',
      'Hugs crush. Hurt it and it charges whether you watch or not.',
    ],
  },
  gore: { blood: 'red', tint: 0xffffff, flesh: 0xd8823c, sever: ['tail2', 'handL', 'handR', 'jaw', 'crest', 'farmL', 'farmR', 'inHand'], head: 'head' },
  build: () => buildDooley(0), animate: animateDooley, think: thinkDooley,
});
onPlayerHit('pg_dooley', (p: Player) => {
  bus.emit('think', p, ['It is hugging me. It is so warm. Something in the belly is pressing against me.', 'It squeezed. Something cracked. The grin did not change.', 'I can hear someone breathing inside it.'][Math.floor(Math.random() * 3)]);
});

// ------------------------------------------------------------------ stand-alone posing (gallery, video)
/** animate a Dooley rig with no game running; call every frame with a running clock */
export function poseDooley(rig: KitRig, t: number, dt: number, pose: DooleyPose = 'idle', o: { split?: number; speed?: number; variant?: number; yaw?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant % 2) kitPersonalize(rig, o.variant % 2);
  kitSync(rig);
  const ud = rig.kit.m as Record<string, any>;
  if (ud.gp !== pose) { ud.gp = pose; ud.gT = 0; }
  ud.gT = (ud.gT ?? 0) + dt;
  const speed = o.speed ?? (pose === 'walk' ? 0.85 : pose === 'run' || pose === 'hug' ? 2.8 : 0);
  poseDooleyRig(rig, { t, dt, speed, md: pose === 'run' ? 'hug' : pose === 'idle' || pose === 'walk' || pose === 'dead' ? '' : pose, mdT: pose === 'bow' ? (ud.gT % 2.4) : pose === 'squeeze' ? (ud.gT % 1.8) : ud.gT, atk: 0, flinch: 0, dead: pose === 'dead' ? 1 : 0, split: o.split ?? 0.35, seed: 0.37, yaw: o.yaw ?? 0, pitch: 0 });
  rig.kit.F.fx.value.y += dt;
}
DOOLEY.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['walk', 'wave', 'dance', 'bow', 'hug', 'squeeze'][Math.floor(t / 5) % 6]) as DooleyPose;
  poseDooley(rig as KitRig, t, 1 / 60, q, { variant: u.get('v') ? Number(u.get('v')) : 0, split: u.get('split') ? Number(u.get('split')) : undefined });
};
horrify(DOOLEY, { twitch: 0.25, snap: 0.1, breathe: 0.006, lunge: 0.1, parts: /head|jaw|inHand|inF|crest/, keepMaterials: false });
