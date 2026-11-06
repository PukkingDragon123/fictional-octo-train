import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { op } from '../../game/ops';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { CS, zoneOf, pulse, stop, faceTo, findSpot, onPlayerHit, onKilled, creatureMenu, poke, poked, floorItemsAround } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, walkable } from '../behaviors_b';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, V3, Wt, Row, buildKitRig, kitSync, kitPersonalize, flinchOf, hash, usFor, gauss,
  tube, handLoft, footLoft, ringY, SHOE_DRESS, clamp01, norm, cross,
} from '../kit/humanoids';
import { sac, plate, paintCap } from '../kit/organic';
import { attachFilm, filmPersonalize, films, uprightDead } from '../kit/gel';
import { hitPlayer, playersNear } from '../kit/oddkit';
import { KINDS, type BloodKind } from '../../gore/kinds';
import { itemDef } from '../../items/item';
import { createItem, serializeItem } from '../../items/factory';
import { ruleShown } from '../rules';

// =====================================================================================
// TIMMY: the Ball House kids. A child of five or six whose head has swollen into a
// thin, taut balloon of skin twice the width of its shoulders. The head floats; the
// little body dangles under it on a stretched neck, socks and sneakers kicking at
// nothing a hand's breadth off the floor. Every one of them wears a too-small
// propeller beanie with an elastic strap dug into its cheeks, a loud printed shirt,
// and holds a lollipop it licks to keep itself calm. They giggle, wave, follow you
// about and want to play. Stay close too long, hurt one, or let it get bored, and
// it gulps air between giggles until the head swells, reddens, squeaks and wobbles
// and then pops: confetti, candy and the rest of it, over everything near it.
// A sweet thrown near one (or given to it) calms it: it sucks, hums, forgets you.
//   timmy        one skinned kit mesh (src/creatures/kit/humanoids.ts) on a head-rooted
//                skeleton (float -> head; float -> neck -> chest -> spine -> hips -> legs),
//                a translucent red flush shell over the head for the charge (kit/gel.ts),
//                six kids (builds, faces, hair, skin tones, shirts, sizes).
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildTimmy(variant 0..5)                         -> KitRig (rig.root into any scene)
//   poseTimmy(rig, t, dt, pose, { ch, speed, variant, look, ax, az })
//       pose: 'idle' | 'drift' | 'wave' | 'follow' | 'lick' | 'giggle' | 'beg' | 'eat' |
//             'charge' | 'hide' | 'rise' | 'deflate' | 'popped' | 'dead'
//       ch (0..1) drives the swelling for 'charge' (default: loops over 6 s)
//   timmyBurst(parent, at, power)                    -> (dt) => alive: a self-contained
//       confetti / candy / blood burst for staging the pop without the game
// =====================================================================================

const D2R = Math.PI / 180;
const SIDES = [['L', 1], ['R', -1]] as const;
type Hair = 'bowl' | 'curls' | 'pigtails' | 'buzz' | 'part' | 'tuft';
type Print = 'sun' | 'dots' | 'stars' | 'dino' | 'hearts' | 'rainbow';
interface Kid {
  /** head radius, head centre height, body length, girth */
  hr: number; hy: number; b: number; g: number;
  skin: number; hair: number; style: Hair; iris: number;
  shirt: number; ink: [number, number]; print: Print;
  pants: number; sock: [number, number]; shoe: [number, number];
  cap: [number, number, number, number]; brim: number; blades: [number, number]; pop: [number, number];
  freckles?: boolean; gap?: boolean; braces?: boolean; lazy?: boolean; plaster?: boolean;
}
/** the six kids (the Ball House never makes the same one twice in a row) */
export const KIDS: Kid[] = [
  { hr: 0.42, hy: 1.56, b: 1.0, g: 1.0, skin: 0xf0c4a2, hair: 0xc4521e, style: 'bowl', iris: 0x3a7ac0, shirt: 0xffd22a, ink: [0xff6a1a, 0xe02a2a], print: 'sun',
    pants: 0x2a5ac0, sock: [0xf4f4f0, 0xe03a3a], shoe: [0xd82a2a, 0xf4f0e8], cap: [0xe02a2a, 0xffd21a, 0x2a6ae0, 0x2aa84a], brim: 0x2a6ae0, blades: [0xe02a2a, 0xffd21a], pop: [0xff2a4a, 0xfff4f0], freckles: true, gap: true },
  { hr: 0.45, hy: 1.52, b: 0.94, g: 1.36, skin: 0x8a583a, hair: 0x1a1210, style: 'curls', iris: 0x3a2414, shirt: 0x2ac8ea, ink: [0xff5aa8, 0xffe03a], print: 'dots',
    pants: 0xf07a1a, sock: [0xf4f4f0, 0x2a8ae0], shoe: [0x2a9a3a, 0xf4f0e8], cap: [0x2a6ae0, 0xffd21a, 0xe02a2a, 0x2aa84a], brim: 0xe02a2a, blades: [0x2a6ae0, 0xffffff], pop: [0x3ad84a, 0xfff03a], braces: true },
  { hr: 0.4, hy: 1.66, b: 1.12, g: 0.84, skin: 0xf6dccc, hair: 0xf0d27a, style: 'pigtails', iris: 0x5a9a4a, shirt: 0xff70bc, ink: [0xfff05a, 0xffffff], print: 'stars',
    pants: 0x6a8ad8, sock: [0xffffff, 0xff70bc], shoe: [0xf4f0f0, 0xff70bc], cap: [0xffd21a, 0xe02a2a, 0x2a6ae0, 0xe02a2a], brim: 0xffd21a, blades: [0xff70bc, 0xffffff], pop: [0xa04ae0, 0xfff4f0], lazy: true, plaster: true },
  { hr: 0.38, hy: 1.42, b: 0.86, g: 1.04, skin: 0x5a3824, hair: 0x140c08, style: 'buzz', iris: 0x2a1a10, shirt: 0x8ae02a, ink: [0xff7a1a, 0x2a6a2a], print: 'dino',
    pants: 0xc82a2a, sock: [0xf4f4f0, 0x2aa84a], shoe: [0x2a2a8a, 0xf4f0e8], cap: [0x2aa84a, 0xe02a2a, 0xffd21a, 0x2a6ae0], brim: 0xe02a2a, blades: [0xffd21a, 0x2aa84a], pop: [0x2a7aff, 0xfff4f0], gap: true },
  { hr: 0.43, hy: 1.58, b: 1.02, g: 1.12, skin: 0xd6a272, hair: 0x2a1810, style: 'part', iris: 0x4a2a14, shirt: 0xe8321e, ink: [0xffffff, 0xffd23a], print: 'hearts',
    pants: 0x3a3a4a, sock: [0xf0e02a, 0xe8321e], shoe: [0x1a1a1e, 0xe8e8e0], cap: [0x2a6ae0, 0xe02a2a, 0xffd21a, 0x2aa84a], brim: 0x2aa84a, blades: [0xe02a2a, 0xffffff], pop: [0xff8a1a, 0xffe8f0], freckles: true },
  { hr: 0.44, hy: 1.48, b: 0.9, g: 1.28, skin: 0xe8b6a0, hair: 0xd0782a, style: 'tuft', iris: 0x6a8aa8, shirt: 0xff9a1a, ink: [0x2a8ae0, 0xffffff], print: 'rainbow',
    pants: 0x5aa8e8, sock: [0xffffff, 0xffd21a], shoe: [0xf0d21a, 0xf4f0e8], cap: [0xe02a2a, 0x2a6ae0, 0xffd21a, 0x2aa84a], brim: 0xffd21a, blades: [0x2aa84a, 0xffd21a], pop: [0xff5aa8, 0x8ae0ff], braces: true, plaster: true },
];
const NV = KIDS.length;

// ------------------------------------------------------------------ proportions
interface Geo { K: Kid; v: number; R: number; HY: number; b: number; g: number; s: number; NB: number; SH: number; sw: number; HIP: number; gl: number; capPh: number }
const GEO: Geo[] = KIDS.map((K, v) => {
  const R = K.hr, HY = K.hy, b = K.b, g = K.g;
  const NB = HY - R * 1.04;                  // where the balloon pinches into the neck
  const SH = NB - 0.075 * b;                 // the shoulder line
  return { K, v, R, HY, b, g, s: R / 0.42, NB, SH, sw: 0.098 * Math.sqrt(g) * (0.92 + 0.08 * b), HIP: SH - 0.33 * b, gl: 0.82 + 0.26 * g, capPh: Math.acos(Math.min(0.95, 0.158 * (R / 0.42) / R)) / D2R };
});

/** the balloon's shape: radius multiplier toward (th, ph) in degrees (0, 0 = straight ahead) */
function headK(th: number, ph: number, v: number): number {
  const a = Math.abs(th);
  let k = 1;
  k += 0.035 * Math.max(0, Math.sin(ph * D2R));                         // the cranium swells most
  k += 0.06 * gauss(a, 26, 13) * gauss(ph, F.cheek, 11);               // cheeks
  k += 0.045 * gauss(th, 0, 11) * gauss(ph, F.chin, 7);                 // chin
  k += 0.022 * gauss(a, 9, 9) * gauss(ph, F.brow, 4.5);                 // brow
  k -= 0.03 * gauss(a, F.eyeTh, 5.5) * gauss(ph, F.eye, 5);             // eye sockets
  k -= 0.016 * gauss(th, 0, 10) * gauss(ph, F.mouth, 3);                // the mouth line
  k -= 0.03 * gauss(ph, -72, 9);                                        // under the jaw, tucking in to the knot
  // the beanie's elastic chin strap, dug into the skin
  const su = strapU(ph); if (su >= 0) k -= 0.013 * gauss(a, strapTh(su), 2.4);
  // the skull under it is not round, and every kid's is different
  k += 0.011 * Math.sin(th * D2R * 3 + v * 1.7) * Math.cos(ph * D2R * 2 + v * 0.7);
  return k;
}
/** where the face sits (degrees of latitude; up near the equator so the iso camera sees it) */
const F = { eye: -11, eyeTh: 9.5, brow: -2.5, nose: -21, lipU: -30.6, mouth: -32.3, lipD: -34.1, chin: -46, cheek: -24, ear: -12, jaw: -26, tongue: -32.7 };
/** the chin strap: from the beanie's side, down past the ears, under the chin */
const strapU = (ph: number) => (ph <= 66 && ph >= -62 ? (66 - ph) / 128 : -1);
const strapTh = (u: number) => 88 * Math.pow(Math.max(0, 1 - u), 0.55);
function headPt(q: Geo, th: number, ph: number, k = 1): V3 {
  const r = q.R * headK(th, ph, q.v) * k, t = th * D2R, p = ph * D2R;
  return [r * Math.cos(p) * Math.sin(t), q.HY + r * 1.04 * Math.sin(p), r * 0.98 * Math.cos(p) * Math.cos(t)];
}
function headN(th: number, ph: number): V3 { const t = th * D2R, p = ph * D2R; return [Math.cos(p) * Math.sin(t), Math.sin(p), Math.cos(p) * Math.cos(t)]; }
function headUp(th: number, ph: number): V3 { const t = th * D2R, p = ph * D2R; return [-Math.sin(p) * Math.sin(t), Math.cos(p), -Math.sin(p) * Math.cos(t)]; }
function headRight(th: number): V3 { const t = th * D2R; return [Math.cos(t), 0, -Math.sin(t)]; }
// texture mapping of the head: the face band gets most of the pixels
const pw = (x: number, xs: number[], ys: number[]) => { for (let i = 0; i + 1 < xs.length; i++) if (x <= xs[i + 1]) return ys[i] + (ys[i + 1] - ys[i]) * ((x - xs[i]) / (xs[i + 1] - xs[i])); return ys[ys.length - 1]; };
const UX = [-180, -50, 50, 180], UY = [0, 0.24, 0.76, 1];
const VX = [-90, -60, 15, 90], VY = [0, 0.1, 0.68, 1];
const U = (th: number) => pw(th, UX, UY), V = (ph: number) => pw(ph, VX, VY);
const thOf = (u: number) => pw(u, UY, UX), phOf = (v: number) => pw(v, VY, VX);
const TH = Array.from({ length: 49 }, (_, j) => -180 + j * 7.5);
const PH = [-82, -77, -72, -67, -62, -57, -53, -50, -47.5, -45, -42, -38, -34, -30, -26, -22, -18, -14, -9, -4, 2, 9, 17, 26, 36, 47, 58, 69, 80];

/** hairline (lowest latitude of hair) per kid, by longitude */
function hairline(st: Hair, th: number, v: number): number {
  const a = Math.abs(th);
  const L = (f: number, s: number, bk: number) => (a < 35 ? f : a < 100 ? f + (s - f) * e3((a - 35) / 65) : s + (bk - s) * e3((a - 100) / 80));
  switch (st) {
    case 'bowl': return L(2, -8, -24) + (hash(Math.round(th / 7.5), 31 + v) - 0.5) * 3;
    case 'curls': return L(6, -6, -26);
    case 'pigtails': return L(8, -2, -20);
    case 'part': return L(th < 0 ? 0 : 6, -6, -24);
    case 'tuft': return L(6, -5, -22);
    default: return L(7, -4, -24);
  }
}

// ------------------------------------------------------------------ skeleton
function bonesT(v: number): BoneSpec[] {
  const q = GEO[v], { R, HY, b, SH, sw, HIP } = q;
  const eyeR = 0.03 * q.s;
  const eye = (k: number) => headPt(q, k * F.eyeTh, F.eye, 1 - (eyeR * 0.5) / R);
  const ua = 0.16 * b, fa = 0.14 * b, th = 0.2 * b, sh = 0.19 * b;
  const capY = headPt(q, 0, q.capPh, 1.03)[1];
  const jaw = headPt(q, 0, F.jaw, 0.72), tng = headPt(q, 0, F.tongue, 0.93);
  const A: [string, string, V3, boolean?][] = [
    ['base', '', [0, 0, 0]],
    ['float', 'base', [0, HY, 0]],
    ['head', 'float', [0, HY, 0], true],
    ['eyeL', 'head', eye(1)], ['eyeR', 'head', eye(-1)],
    ['jaw', 'head', jaw], ['tongue', 'jaw', tng],
    ['cap', 'head', [0, capY, 0]], ['prop', 'cap', [0, capY + 0.2 * q.s, 0]],
    ['neck', 'float', [0, HY - R * 0.95, 0]],
    ['chest', 'neck', [0, SH - 0.06 * b, 0.004]],
    ['spine', 'chest', [0, SH - 0.2 * b, 0]],
    ['hips', 'spine', [0, SH - 0.29 * b, 0]],
  ];
  for (const [s, k] of SIDES) {
    const x = k * (sw + 0.012);
    A.push(['uarm' + s, 'chest', [x, SH - 0.03 * b, -0.004], true], ['farm' + s, 'uarm' + s, [x, SH - 0.03 * b - ua, -0.004], true],
      ['hand' + s, 'farm' + s, [x, SH - 0.03 * b - ua - fa, -0.004], true],
      ['fing1' + s, 'hand' + s, [x, SH - 0.03 * b - ua - fa - 0.055 * b * 0.6 / 0.62, -0.004]],
      ['fing2' + s, 'fing1' + s, [x, SH - 0.03 * b - ua - fa - 0.083 * b * 0.6 / 0.62, -0.004]],
      ['thumb' + s, 'hand' + s, [x - k * 0.003, SH - 0.03 * b - ua - fa - 0.016, 0.02 * b]]);
  }
  A.push(['pop', 'handR', [-(sw + 0.012), SH - 0.03 * b - ua - fa - 0.036 * b, 0.006]]);
  for (const [s, k] of SIDES) {
    const x = k * 0.056 * Math.sqrt(q.g);
    A.push(['thigh' + s, 'hips', [x, HIP, 0], true], ['shin' + s, 'thigh' + s, [x, HIP - th, 0.004], true], ['foot' + s, 'shin' + s, [x, HIP - th - sh, -0.004], true]);
  }
  const abs = new Map<string, V3>();
  return A.map(([name, parent, p, cap]) => {
    abs.set(name, p);
    const pp = parent ? abs.get(parent)! : [0, 0, 0];
    return { name, parent, at: [p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]], cap };
  });
}

// ------------------------------------------------------------------ page
function layoutT(p: Page) {
  p.reg('HEAD', 160, 96); p.reg('SHIRT', 80, 48);
  p.reg('ARM_L', 24, 32); p.reg('ARM_R', 24, 32); p.reg('LEG_L', 24, 40); p.reg('LEG_R', 24, 40); p.reg('HAIR', 64, 24); p.reg('BEANIE', 48, 20);
  p.reg('EYE', 32, 16); p.reg('HAND_L', 16, 16); p.reg('HAND_R', 16, 16); p.reg('SHOE_L', 24, 16); p.reg('SHOE_R', 24, 16); p.reg('POP', 32, 24); p.reg('SKIN', 16, 16); p.reg('NECK', 24, 12);
  p.reg('LIP', 16, 8); p.reg('MOUTH', 16, 8); p.reg('TOOTH', 8, 8); p.reg('METAL', 8, 4); p.reg('TONGUE', 8, 8); p.reg('BRIM', 16, 8); p.reg('PROP', 16, 8); p.reg('PROP2', 16, 8); p.reg('STICK', 8, 8); p.reg('CAP', 16, 16);
}

// ------------------------------------------------------------------ geometry helpers
/** a lat-long eyeball whose front looks along yaw (radians about y) */
function eyeball(B: SkinB, c: V3, r: number, yaw: number, reg: Region, w: Wt, g: number) {
  const n = 12, rings = 8, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const rot = (p: V3): V3 => [c[0] + p[0] * cy + p[2] * sy, c[1] + p[1], c[2] - p[0] * sy + p[2] * cy];
  const rr: { pts: V3[]; v: number; w: Wt }[] = [];
  for (let i = 1; i < rings; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / rings;
    rr.push({ pts: ringY(Math.sin(a) * r * 1.04, 0, 0, Math.cos(a) * r, Math.cos(a) * r, Math.cos(a) * r, n).map(rot), v: i / rings, w });
  }
  B.loft(rr, usFor(n), reg, g, { start: rot([0, -r * 1.04, 0]), end: rot([0, r * 1.04, 0]), startW: w, endW: w, startV: 0, endV: 1 });
}
function boxAt(B: SkinB, c: V3, size: V3, th: number, ph: number, reg: Region, w: Wt) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-ph * D2R, th * D2R, 0, 'YXZ'));
  B.box(c, size, m, reg, w);
}

function buildT(B: SkinB, x: BuildCtx) {
  const q = GEO[x.variant], K = q.K, { R, b, s } = q, bi = x.bi, rr = x.rest, Rg = x.R;
  const H = bi('head'), J = bi('jaw'), N = bi('neck');
  // ================= the head: one taut balloon of skin
  const jawW = (th: number, ph: number): number => clamp01((F.lipD - 1.5 - ph) / 7) * clamp01((ph + 66) / 8) * gauss(th, 0, 22);
  const us = TH.map(U);
  const rings = PH.map((ph) => ({ pts: TH.map((th) => headPt(q, th, ph)), v: V(ph), w: (_p: V3, j: number): Wt => { const wj = jawW(TH[j], ph); return wj > 0.01 ? [H, 1 - wj, J, wj] : ph < -78 ? [H, 0.8, N, 0.2] : [H, 1]; } }));
  // the knot: skin gathered and puckered into the top of the neck
  const nr = 0.046 * q.gl;
  const pucker = (y: number, r0: number, wv: number, wt: Wt, vv: number) => ({ pts: TH.map((th) => { const t = th * D2R, kk = 1 + wv * Math.sin(th * D2R * 9); return [Math.sin(t) * r0 * kk, y, Math.cos(t) * r0 * kk] as V3; }), v: vv, w: wt });
  const pk = [pucker(q.HY - R * 1.035, 0.082 * s, 0.12, [H, 0.6, N, 0.4], 0.03), pucker(q.NB - 0.004, nr * 1.15, 0.06, [H, 0.3, N, 0.7], 0.01)];
  B.loft([pk[1], pk[0], ...rings], us, Rg('HEAD'), 1, { end: headPt(q, 0, 90), endW: [H, 1], endV: 1 });

  // eyes, a little too far apart (the skin between them stretched)
  for (const [sd, k] of SIDES) {
    const e = rr('eye' + sd), w: Wt = [bi('eye' + sd), 1];
    eyeball(B, e, 0.03 * s, k * 4 * D2R, Rg('EYE'), w, 2);
  }
  // a button nose
  { const w: Wt = [H, 1]; sac(B, Rg('SKIN'), 3, [headPt(q, 0, F.nose + 1.5, 0.975), headPt(q, 0, F.nose, 1.04), headPt(q, 0, F.nose - 1.5, 1.055)], [[0.017 * s, 0.014 * s], [0.02 * s, 0.017 * s], [0.011 * s, 0.009 * s]], [w, w, w], { n: 8 }); }
  // small ears, set low on the sides of the giant head
  for (const [, k] of SIDES) {
    const w: Wt = [H, 1], th = k * 84;
    sac(B, Rg('SKIN'), 4, [headPt(q, th, F.ear, 0.985), headPt(q, th + k * 2, F.ear, 1.03), headPt(q, th + k * 3, F.ear - 0.5, 1.055)], [[0.026 * s, 0.038 * s], [0.03 * s, 0.045 * s], [0.016 * s, 0.026 * s]], [w, w, w], { n: 10, up: [0, 0, 1] });
  }
  // the mouth: a dark slit that stretches open with the jaw, a toothy grin, lips
  {
    const ph0 = F.mouth, c0 = headPt(q, 0, ph0, 1.0), out = headN(0, ph0), up = headUp(0, ph0);
    const bul = 0.022 * s;
    const c: V3 = [c0[0] - out[0] * (bul - 0.002), c0[1] - out[1] * (bul - 0.002), c0[2] - out[2] * (bul - 0.002)];
    plate(B, Rg('MOUTH'), 5, c, [1, 0, 0], up, R * Math.sin(10.5 * D2R), 0.0085 * s, bul, (_u, vv) => { const wj = clamp01((0.25 - vv) / 1.1); return wj > 0.01 ? [H, 1 - wj, J, wj] : [H, 1]; }, { rows: 4, cols: 8, oval: 0.85 });
    const lip = (ph: number, lift: number, kk: number, r0: number, w: Wt, g: number) => {
      const ths = [-13, -9, -4.5, 0, 4.5, 9, 13];
      sac(B, Rg('LIP'), g, ths.map((th) => headPt(q, th, ph + lift * (th / 13) ** 2, kk)), ths.map((th) => { const f = 1 - (th / 15) ** 2; return [r0 * (0.45 + 0.55 * f) * s, r0 * 0.75 * (0.45 + 0.55 * f) * s] as [number, number]; }), ths.map(() => w), { n: 6, up: [0, 0, 1] });
    };
    lip(F.lipU, 2.6, 1.004, 0.0085, [H, 1], 6);
    lip(F.lipD, 2.2, 1.006, 0.0105, [J, 1], 7);
    // teeth: milk teeth, one missing on some
    for (let i = -3; i < 3; i++) {
      if (K.gap && i === 0) continue;
      const th = (i + 0.5) * 2.7 + (K.gap ? (i < 0 ? -0.6 : 0.6) : 0), ph = F.mouth + 0.5;
      boxAt(B, headPt(q, th, ph, 1.006), [0.0105 * s * (Math.abs(i + 0.5) < 1 ? 1.15 : 1), 0.011 * s, 0.006 * s], th, ph, Rg('TOOTH'), [H, 1]);
    }
    for (let i = -2; i < 2; i++) { const th = (i + 0.5) * 2.5, ph = F.mouth - 1.3; boxAt(B, headPt(q, th, ph, 1.003), [0.0085 * s, 0.008 * s, 0.005 * s], th, ph, Rg('TOOTH'), [J, 1]); }
    if (K.braces) boxAt(B, headPt(q, 0, F.mouth + 0.6, 1.011), [R * Math.sin(8 * D2R) * 2, 0.0022 * s, 0.003 * s], 0, F.mouth + 0.6, Rg('METAL'), [H, 1]);
    // the tongue, back behind the teeth until it licks
    const t0 = rr('tongue'), on = headN(0, F.tongue), tw: Wt = [bi('tongue'), 1];
    sac(B, Rg('TONGUE'), 8, [t0, [t0[0] + on[0] * 0.03 * s, t0[1] + on[1] * 0.03 * s, t0[2] + on[2] * 0.03 * s], [t0[0] + on[0] * 0.05 * s, t0[1] + on[1] * 0.05 * s - 0.004, t0[2] + on[2] * 0.05 * s]],
      [[0.016 * s, 0.006 * s], [0.017 * s, 0.006 * s], [0.011 * s, 0.005 * s]], [tw, tw, tw], { n: 8, up: [0, 1, 0] });
  }
  // ================= hair (a shell over the scalp; the buzz cut is only painted)
  if (K.style !== 'buzz') {
    const KH = 6, hr: { pts: V3[]; v: number; w: Wt }[] = [];
    for (let k = 0; k <= KH; k++) {
      const f = k / KH;
      hr.push({ pts: TH.map((th) => {
        const p0 = hairline(K.style, th, x.variant), ph = p0 + (86 - p0) * Math.pow(f, 1.35);
        const thick = 1.004 + 0.022 * Math.sin(Math.min(1, f * 3) * Math.PI / 2) + (K.style === 'curls' ? 0.02 * hash(Math.round(th / 7.5), k * 7) * (f > 0 ? 1 : 0.4) : 0)
          + (K.style === 'bowl' && k === 0 ? 0.004 : 0) + (K.style === 'tuft' ? 0.008 * Math.sin(th * D2R * 5 + k) : 0);
        return headPt(q, th, ph, thick);
      }), v: f, w: [H, 1] });
    }
    B.loft(hr, us, Rg('HAIR'), 9, { double: false });
    if (K.style === 'pigtails') for (const [, k] of SIDES) {
      const a = headPt(q, k * 100, 4, 1.02), d = norm([k * 1, -0.6, -0.25]), w: Wt = [H, 1];
      const P = (t: number): V3 => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
      sac(B, Rg('HAIR'), 10, [P(-0.01), P(0.03), P(0.08), P(0.13), P(0.17)], [[0.028, 0.026], [0.04, 0.034], [0.042, 0.036], [0.03, 0.026], [0.008, 0.008]].map(([u, w2]) => [u * s, w2 * s] as [number, number]), [w, w, w, w, w], { n: 8, bump: (aa, t) => 0.12 * Math.sin(aa * 5 + t * 9) });
      sac(B, Rg('METAL'), 11, [P(0.0), P(0.012)], [[0.03 * s, 0.03 * s], [0.03 * s, 0.03 * s]], [w, w], { n: 8 });
    }
    if (K.style === 'tuft') for (let i = 0; i < 4; i++) {
      const a = headPt(q, -30 + i * 22, 52 + (i % 2) * 5, 1.02), up = headN(-30 + i * 22, 52), w: Wt = [H, 1];
      const P = (t: number, sw2: number): V3 => [a[0] + up[0] * t + sw2, a[1] + up[1] * t, a[2] + up[2] * t - sw2 * 0.5];
      sac(B, Rg('HAIR'), 10, [P(-0.01, 0), P(0.03, 0.01), P(0.06, 0.03), P(0.07, 0.06)], [[0.02, 0.012], [0.016, 0.01], [0.01, 0.007], [0.003, 0.003]].map(([u, w2]) => [u * s, w2 * s] as [number, number]), [w, w, w, w], { n: 6 });
    }
  }
  // ================= the propeller beanie, much too small, perched on the crown
  {
    const Cb = bi('cap'), cw: Wt = [Cb, 1], cy = rr('cap')[1], rc = 0.158 * s;
    const band = TH.map((th) => { const p = headPt(q, th, q.capPh, 1.034); return p; });
    const prof: [number, number][] = [[1.0, 0.026], [0.94, 0.06], [0.78, 0.095], [0.5, 0.12], [0.18, 0.133]];
    const cr = [{ pts: band, v: 0, w: cw }, ...prof.map(([f, h], i) => ({ pts: TH.map((th) => { const t = th * D2R; return [Math.sin(t) * rc * f * 1.02, cy + h * s, Math.cos(t) * rc * f * 1.02] as V3; }), v: (i + 1) / (prof.length + 1), w: cw }))];
    B.loft(cr, us, Rg('BEANIE'), 12, { end: [0, cy + 0.136 * s, 0], endW: cw, endV: 1 });
    // the bill, tipped down at the front
    const bc: V3 = [0, cy + 0.006 * s, rc * 0.98 + 0.03 * s], bu = norm([0, 0.36, -0.93]);
    plate(B, Rg('BRIM'), 13, bc, [1, 0, 0], bu, 0.07 * s, 0.038 * s, 0.008 * s, cw, { rows: 3, cols: 6 });
    plate(B, Rg('BRIM'), 13, [bc[0], bc[1] - 0.004, bc[2]], [-1, 0, 0], bu, 0.07 * s, 0.038 * s, 0.008 * s, cw, { rows: 3, cols: 6 });
    // button, stalk, hub, two blades
    sac(B, Rg('STICK'), 14, [[0, cy + 0.128 * s, 0], [0, cy + 0.145 * s, 0], [0, cy + 0.2 * s, 0]], [[0.014 * s, 0.014 * s], [0.006 * s, 0.006 * s], [0.005 * s, 0.005 * s]], [cw, cw, cw], { n: 6 });
    const pp = rr('prop'), pw0: Wt = [bi('prop'), 1];
    sac(B, Rg('STICK'), 15, [[pp[0], pp[1] - 0.012, pp[2]], [pp[0], pp[1], pp[2]], [pp[0], pp[1] + 0.012, pp[2]]], [[0.012 * s, 0.012 * s], [0.017 * s, 0.017 * s], [0.008 * s, 0.008 * s]], [pw0, pw0, pw0], { n: 8 });
    for (const k of [1, -1]) {
      const bcn: V3 = [pp[0] + k * 0.075 * s, pp[1], pp[2]], tilt = norm([0, k * 0.32, 0.95]);
      plate(B, Rg(k > 0 ? 'PROP' : 'PROP2'), 16, bcn, [k, 0, 0], tilt, 0.068 * s, 0.019 * s, 0.003, pw0, { rows: 2, cols: 6, oval: 0.6 });
      plate(B, Rg(k > 0 ? 'PROP' : 'PROP2'), 16, [bcn[0], bcn[1] - 0.003, bcn[2]], [-k, 0, 0], tilt, 0.068 * s, 0.019 * s, 0.003, pw0, { rows: 2, cols: 6, oval: 0.6 });
    }
  }
  // ================= the neck: stretched long and thin by the weight hanging off it
  tube(B, { rows: [{ y: q.NB + 0.012, rx: nr * 1.15, rf: nr * 1.15, rb: nr * 1.15 }, { y: q.NB - 0.02, rx: nr, rf: nr, rb: nr * 1.02 }, { y: q.SH + 0.02, rx: nr * 1.05, rf: nr * 1.05, rb: nr * 1.08 }, { y: q.SH - 0.01, rx: nr * 1.5, rf: nr * 1.3, rb: nr * 1.3 }],
    ys: [q.NB + 0.012, q.NB - 0.02, (q.NB + q.SH) / 2, q.SH + 0.02, q.SH - 0.01], n: 12, reg: Rg('NECK'), vr: [q.SH - 0.01, q.NB + 0.012], g: 17,
    w: (y) => (y > q.NB - 0.01 ? [H, 0.25, N, 0.75] : y > q.SH + 0.01 ? [N, 1] : [N, 0.4, bi('chest'), 0.6]) });
  // ================= the little body: shirt, shorts, a round tummy
  const { SH, sw, g } = q, gw = 0.9 + 0.1 * g;
  const C = bi('chest'), Sp = bi('spine'), Hp = bi('hips');
  const TR: Row[] = [
    { y: SH + 0.016, rx: 0.05 * gw, rf: 0.045, rb: 0.045 },
    { y: SH, rx: sw * 0.78, rf: 0.052 * g, rb: 0.05 },
    { y: SH - 0.03 * b, rx: sw, rf: 0.056 * g, rb: 0.054, sq: 2.3 },
    { y: SH - 0.09 * b, rx: sw * 0.96, rf: 0.063 * g, rb: 0.057 },
    { y: SH - 0.17 * b, rx: sw * 0.95 * gw, rf: 0.074 * g * g, rb: 0.06 },
    { y: SH - 0.23 * b, rx: sw * 0.95 * gw, rf: 0.073 * g * g, rb: 0.064 },
    { y: SH - 0.29 * b, rx: sw * 0.97, rf: 0.064 * g, rb: 0.074 },
    { y: SH - 0.34 * b, rx: sw * 0.7, rf: 0.05 * g, rb: 0.056 },
  ];
  const tw = (y: number): Wt => {
    if (y > SH + 0.008) return [N, 0.4, C, 0.6];
    if (y > SH - 0.12 * b) return [C, 1];
    if (y > SH - 0.17 * b) return [C, 1 - (SH - 0.12 * b - y) / (0.05 * b), Sp, (SH - 0.12 * b - y) / (0.05 * b)];
    if (y > SH - 0.22 * b) return [Sp, 1];
    if (y > SH - 0.27 * b) return [Sp, 1 - (SH - 0.22 * b - y) / (0.05 * b), Hp, (SH - 0.22 * b - y) / (0.05 * b)];
    return [Hp, 1];
  };
  const tys = [0.016, 0, -0.012, -0.03, -0.06, -0.09, -0.13, -0.17, -0.2, -0.23, -0.255, -0.27, -0.29, -0.315, -0.34].map((d, i) => SH + (i < 2 ? d : d * b));
  tube(B, { rows: TR, ys: tys, n: 16, reg: Rg('SHIRT'), vr: [SH - 0.34 * b, SH + 0.016], w: tw, g: 18, end: [0, SH + 0.02, 0], start: [0, SH - 0.355 * b, 0],
    bump: (th, y) => (Math.abs(y - (SH - 0.255 * b)) < 0.012 * b ? 0.03 : 0) - 0.04 * gauss(y, SH - 0.2 * b, 0.02) * gauss(th, 0, 0.12) * (g > 1.2 ? 1 : 0) });
  // ================= arms: short sleeves, chubby little arms, small hands
  const gl = q.gl, ua = 0.16 * b, fa = 0.14 * b;
  for (const [sd, k] of SIDES) {
    const Ua = bi('uarm' + sd), Fa = bi('farm' + sd), Hd = bi('hand' + sd), at = rr('uarm' + sd);
    const AR: Row[] = [
      { y: 0.022, rx: 0.026, rf: 0.03, rb: 0.03, cx: -0.012 }, { y: 0.0, rx: 0.037 * gl, rf: 0.037 * gl, rb: 0.037 * gl }, { y: -0.05 * b, rx: 0.039 * gl, rf: 0.038 * gl, rb: 0.038 * gl },
      { y: -0.082 * b, rx: 0.041 * gl, rf: 0.04 * gl, rb: 0.04 * gl }, { y: -0.088 * b, rx: 0.029 * gl, rf: 0.029 * gl, rb: 0.028 * gl }, { y: -ua, rx: 0.025 * gl, rf: 0.025 * gl, rb: 0.027 * gl },
      { y: -ua - 0.06 * b, rx: 0.025 * gl, rf: 0.024 * gl, rb: 0.024 * gl }, { y: -ua - fa + 0.006, rx: 0.019 * gl, rf: 0.021 * gl, rb: 0.02 * gl },
    ];
    const wf = (y: number): Wt => {
      if (y > 0.008) return [C, 0.55, Ua, 0.45];
      if (y > -ua + 0.03 * b) return [Ua, 1];
      if (y > -ua - 0.03 * b) { const t = (-ua + 0.03 * b - y) / (0.06 * b); return [Ua, 1 - t, Fa, t]; }
      if (y > -ua - fa + 0.012) return [Fa, 1];
      return [Fa, 0.6, Hd, 0.4];
    };
    const ar = Rg('ARM_' + sd);
    tube(B, { rows: AR, ys: [0.022, 0.0, -0.025 * b, -0.05 * b, -0.082 * b, -0.088 * b, -0.12 * b, -ua, -ua - 0.03 * b, -ua - 0.06 * b, -ua - 0.1 * b, -ua - fa + 0.006], n: 9, reg: ar, vr: [-ua - fa + 0.006, 0.022], at, w: wf, g: 19 + (k > 0 ? 0 : 1), mirror: k, start: [at[0] - k * 0.018, at[1] + 0.01, at[2]], startW: [C, 0.7, Ua, 0.3] });
    handLoft(B, { k, at: [rr('hand' + sd)[0], rr('hand' + sd)[1] + 0.004, rr('hand' + sd)[2]], bones: { farm: Fa, hand: Hd, f1: bi('fing1' + sd), f2: bi('fing2' + sd), thumb: bi('thumb' + sd) }, reg: Rg('HAND_' + sd), g: 21 + (k > 0 ? 0 : 10), s: 0.6 * b * (0.9 + 0.1 * g),
      fingers: { n: 4, len: [0.07, 0.078, 0.074, 0.06], r: [0.0105, 0.011, 0.0105, 0.0095] }, palm: { len: 0.085, w: 0.046, t: 0.021 }, thumb: { len: 0.058, r: 0.013 } });
  }
  // ================= legs: shorts, bare knees, socks, velcro sneakers
  for (const [sd, k] of SIDES) {
    const T = bi('thigh' + sd), S = bi('shin' + sd), F = bi('foot' + sd), at = rr('thigh' + sd);
    const th = 0.2 * b, sh = 0.19 * b;
    const LR: Row[] = [
      { y: 0.04, rx: 0.052 * gl, rf: 0.054 * gl, rb: 0.058 * gl }, { y: -0.01, rx: 0.058 * gl, rf: 0.058 * gl, rb: 0.06 * gl }, { y: -0.09 * b, rx: 0.057 * gl, rf: 0.057 * gl, rb: 0.058 * gl },
      { y: -0.105 * b, rx: 0.059 * gl, rf: 0.059 * gl, rb: 0.06 * gl }, { y: -0.11 * b, rx: 0.043 * gl, rf: 0.044 * gl, rb: 0.045 * gl }, { y: -th, rx: 0.034 * gl, rf: 0.037 * gl, rb: 0.034 * gl },
      { y: -th - 0.06 * b, rx: 0.035 * gl, rf: 0.033 * gl, rb: 0.04 * gl }, { y: -th - sh + 0.05, rx: 0.028 * gl, rf: 0.028 * gl, rb: 0.029 * gl }, { y: -th - sh + 0.044, rx: 0.031 * gl, rf: 0.031 * gl, rb: 0.032 * gl },
      { y: -th - sh, rx: 0.026 * gl, rf: 0.027 * gl, rb: 0.028 * gl },
    ];
    const wf = (y: number): Wt => {
      if (y > 0.015) return [Hp, 0.5, T, 0.5];
      if (y > -th + 0.035 * b) return [T, 1];
      if (y > -th - 0.035 * b) { const t = (-th + 0.035 * b - y) / (0.07 * b); return [T, 1 - t, S, t]; }
      if (y > -th - sh + 0.01) return [S, 1];
      return [S, 0.5, F, 0.5];
    };
    const lr = Rg('LEG_' + sd);
    tube(B, { rows: LR, ys: [0.04, -0.01, -0.05 * b, -0.09 * b, -0.105 * b, -0.11 * b, -0.15 * b, -th, -th - 0.03 * b, -th - 0.06 * b, -th - 0.11 * b, -th - sh + 0.05, -th - sh + 0.044, -th - sh + 0.02, -th - sh], n: 9, reg: lr, vr: [-th - sh, 0.04], at, w: wf, g: 41 + (k > 0 ? 0 : 1), mirror: k,
      start: [at[0], at[1] + 0.05, at[2]], startW: [Hp, 0.7, T, 0.3], bump: (a, y) => 0.06 * gauss(y, -th, 0.012) * gauss(a, 0, 0.6) });
    footLoft(B, { k, at: rr('foot' + sd), rows: SHOE_DRESS, ground: -0.05 * b, sole: 0.016, lip: 0.004, reg: Rg('SHOE_' + sd), w: [F, 1], g: 43 + (k > 0 ? 0 : 1), s: 0.64 * b, sx: 1.15, toeLift: 0.5 });
  }
  // ================= the lollipop, gripped in the right fist
  {
    const pp = rr('pop'), w: Wt = [bi('pop'), 1];
    sac(B, Rg('STICK'), 50, [[pp[0], pp[1], pp[2] - 0.028], [pp[0], pp[1], pp[2] + 0.05], [pp[0], pp[1], pp[2] + 0.115]], [[0.0045, 0.0045], [0.0045, 0.0045], [0.0045, 0.0045]], [w, w, w], { n: 6 });
    const cz = pp[2] + 0.165, R0 = 0.058;
    const ys = [-0.011, -0.008, -0.003, 0.003, 0.008, 0.011], rs = [0.6, 0.93, 1, 1, 0.93, 0.6];
    const pr = ys.map((y, i) => ({ pts: ringY(pp[1] + y, pp[0], cz, R0 * rs[i], R0 * rs[i], R0 * rs[i], 18), v: 0.1 + 0.8 * (i / (ys.length - 1)), w }));
    B.loft(pr, usFor(18), Rg('POP'), 51, { start: [pp[0], pp[1] - 0.012, cz], end: [pp[0], pp[1] + 0.012, cz], startW: w, endW: w, startV: 0, endV: 1 });
  }
}

// ------------------------------------------------------------------ painting
function paintT(p: Page, x: BuildCtx) {
  const v = x.variant, q = GEO[v], K = q.K;
  const SK = makeRamp(K.skin, 9, { hueShift: 0.035, spread: 0.52 });
  const HR = makeRamp(K.hair, 7, { hueShift: 0.04, spread: 0.6 });
  const dark = mixHex(K.skin, 0x2a0a10, 0.45), pink = mixHex(K.skin, 0xff5a6a, 0.5);
  const shirtVR: [number, number] = [q.SH - 0.34 * q.b, q.SH + 0.016], armVR: [number, number] = [-0.3 * q.b + 0.006, 0.022], legVR: [number, number] = [-0.39 * q.b, 0.04];
  const rowOf = (rg: Region, y: number, vr: [number, number]) => (1 - (y - vr[0]) / (vr[1] - vr[0])) * rg.h - 0.5;
  // ---------------- the head
  const r = p.R('HEAD');
  const PX = (th: number) => U(th) * r.w - 0.5, PY = (ph: number) => (1 - V(ph)) * r.h - 0.5;
  for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
    const th = thOf((xx + 0.5) / r.w), ph = phOf(1 - (yy + 0.5) / r.h);
    const n = headN(th, ph);
    let l = 4.4 + 1.7 * (0.6 * n[1] + 0.4 * n[2]) + (r.fbm(xx, yy, 4, 2, 7 + v) - 0.5) * 0.7;
    l += 2.4 * gauss(th, -30, 20) * gauss(ph, 40, 13);       // the shine of skin stretched like a balloon
    l -= 1.6 * gauss(ph, -84, 5) + 0.6 * gauss(ph, -70, 6);  // shadow under the chin, at the knot
    r.put(xx, yy, SK, l, 0.45);
    // blush on the cheeks, and the paleness of the stretched crown
    const bl = gauss(Math.abs(th), 25, 8) * gauss(ph, F.cheek, 6);
    if (bl > 0.05) r.blend(xx, yy, pink, Math.min(0.55, bl * 0.75));
    if (ph > 20) r.blend(xx, yy, 0xfff4f0, 0.1 * clamp01((ph - 20) / 50));
    // the knot: radial creases where the skin is gathered
    if (ph < -70 && (Math.round(th / 7.5) & 1) && hash(xx, yy) < 0.7) r.blend(xx, yy, dark, 0.35 * clamp01((-70 - ph) / 8));
  }
  // veins at the temples and behind, blue under thin skin
  for (let i = 0; i < 16; i++) {
    const th = (i % 2 ? 1 : -1) * (55 + hash(i, 3 + v) * 70), ph = -2 + hash(i, 5 + v) * 40;
    r.crack(PX(th), PY(ph), 8 + Math.floor(hash(i, 7) * 10), 80 + hash(i, 9) * 30, 0x6a7ab8, 40 + i + v * 7, 0.28, 0.25);
  }
  // stretch marks: pale streaks running up from the knot and down from the crown
  for (let i = 0; i < 34; i++) {
    const th = -180 + hash(i, 11 + v) * 360, top = i % 3 === 0, ph = top ? 30 + hash(i, 13) * 30 : -76 + hash(i, 13) * 12;
    const x0 = PX(th), y0 = PY(ph), L = 3 + Math.floor(hash(i, 15) * 5);
    for (let k = 0; k < L; k++) r.blend(x0 + (hash(i, k) - 0.5) * 0.8, y0 + (top ? k : -k), SK[8], 0.32);
  }
  // the elastic chin strap
  for (let ph = 66; ph > -62; ph -= 0.35) {
    const ts = strapTh(strapU(ph));
    for (const k of [1, -1]) {
      const xx = PX(k * ts), yy = PY(ph);
      r.set(xx, yy, 0x1e1e26); r.set(xx + 1, yy, 0x34343e);
      r.blend(xx - 1, yy, SK[7], 0.5); r.blend(xx + 2, yy, SK[7], 0.5);
      if ((Math.round(ph * 2) % 5) === 0) r.blend(xx, yy, 0xd8d8e0, 0.6);
    }
  }
  // face: brows, lash lines, the hollows under the eyes, a crease above the lip, dimples
  for (const k of [1, -1]) {
    for (let t = 0; t <= 1; t += 0.03) {
      const th = k * (3.5 + t * 12), ph = F.brow + 0.5 + 2.4 * Math.sin(t * Math.PI) - t * 1.6;
      r.set(PX(th), PY(ph), HR[1]); if (t > 0.15 && t < 0.8) r.set(PX(th), PY(ph) - 1, HR[2]);
    }
    for (let a = 0; a < Math.PI * 2; a += 0.06) {
      const th = k * F.eyeTh + Math.cos(a) * 5.4, ph = F.eye + Math.sin(a) * 5.0, up = Math.sin(a) > 0;
      r.blend(PX(th), PY(ph), up ? 0x1a0a0a : dark, up ? 0.85 : 0.35);
      if (up && Math.sin(a) > 0.5) r.blend(PX(th), PY(ph) - 1, 0x2a1414, 0.5);
    }
    for (let a = 0.3; a < Math.PI - 0.3; a += 0.08) r.blend(PX(k * F.eyeTh + Math.cos(a) * 5), PY(F.eye - 6.5 - Math.sin(a) * 1.4), 0x7a5a8a, 0.22);
    r.blend(PX(k * 15), PY(F.lipU + 0.4), dark, 0.6); r.blend(PX(k * 15.5), PY(F.lipU - 0.6), dark, 0.45);
  }
  for (let ph = F.nose - 4; ph > F.lipU + 0.5; ph -= 0.4) { r.blend(PX(-1.2), PY(ph), dark, 0.25); r.blend(PX(1.2), PY(ph), dark, 0.25); }
  for (let th = -7; th <= 7; th += 0.5) r.blend(PX(th), PY(F.chin + 4.5 - (th / 7) ** 2 * 0.6), dark, 0.22);
  r.glow(PX(0), PY(F.nose - 2.5), 4, 2, dark, 0.3);
  if (K.freckles) for (let i = 0; i < 46; i++) { const th = (hash(i, 21 + v) - 0.5) * 60, ph = F.nose - 5 + hash(i, 23 + v) * 14; if (Math.abs(th) < 3 && ph > F.nose - 1) continue; r.blend(PX(th), PY(ph), mixHex(K.skin, 0x6a3018, 0.55), 0.7); }
  if (K.plaster) { const x0 = PX(-4), y0 = PY(F.nose + 3); r.rect(x0 - 2, y0, 6, 2, 0xe8c8a0); r.set(x0, y0, 0xd0a878); r.set(x0 + 1, y0 + 1, 0xd0a878); }
  // hair painted onto the scalp (the shell sits on it; a buzz cut is only this)
  for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
    const th = thOf((xx + 0.5) / r.w), ph = phOf(1 - (yy + 0.5) / r.h), hl = hairline(K.style, th, v);
    if (ph < hl - 1.5) continue;
    if (K.style === 'buzz') { if (hash(xx, yy * 3 + 1) < 0.62) r.blend(xx, yy, HR[1 + (hash(xx * 7, yy) < 0.3 ? 1 : 0)], 0.85); }
    else r.put(xx, yy, HR, 2.6 + (r.fbm(xx, yy, 6, 1, 3) - 0.5) * 1.6 + (((xx + (yy >> 2)) % 3) === 0 ? 0.5 : 0), 0.6);
  }
  // ---------------- hair shell: strands running from the crown, a lighter band
  {
    const h = p.R('HAIR');
    h.fill(HR, (xx, yy) => {
      const f = 1 - (yy + 0.5) / h.h;
      const strand = ((xx + Math.floor(hash(Math.floor(xx / 2), 5 + v) * 5)) % 4) / 4;
      return 2.8 + strand * 1.2 + (h.fbm(xx, yy, 4, 2, 9 + v) - 0.5) * 1.2 + 1.3 * gauss(f, 0.55, 0.12) * gauss((xx / h.w) * 360 - 180, -30, 60) - (f < 0.1 ? 0.8 : 0) + (K.style === 'curls' ? Math.sin(xx * 1.7 + yy * 2.3) * 0.9 : 0);
    }, undefined, 0.6);
    if (K.style === 'pigtails') { for (let yy = 0; yy < h.h; yy++) h.blend(Math.round(h.w / 2), yy, HR[0], 0.8); }
  }
  // ---------------- eyes: wide, wet, a little too bright
  {
    const e = p.R('EYE'), cx = e.w / 2, cy = e.h / 2;
    const IR = makeRamp(K.iris, 5, { spread: 0.6 });
    for (let yy = 0; yy < e.h; yy++) for (let xx = 0; xx < e.w; xx++) {
      const dx = (xx + 0.5 - cx), dy = (yy + 0.5 - cy), d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (d < 1.7) e.set(xx, yy, 0x060404);
      else if (d < 3.9) e.set(xx, yy, IR[Math.max(0, Math.min(4, Math.round(2.6 - (d - 1.7) * 0.6 + Math.sin(a * 7) * 0.6 + (dy < 0 ? 0.6 : -0.4))))]);
      else if (d < 4.5) e.set(xx, yy, IR[0]);
      else e.set(xx, yy, mixHex(0xf6f2ee, 0xe8b8b0, clamp01((Math.abs(dx) - 6) / 10) * 0.8));
    }
    for (let i = 0; i < 6; i++) e.crack(i % 2 ? 2 : e.w - 3, cy + (hash(i, 3) - 0.5) * 6, 5, i % 2 ? 0 : 180, 0xd85a5a, 60 + i, 0.4, 0.2);
    e.set(cx - 2, cy - 2, 0xffffff); e.set(cx - 1, cy - 2, 0xffffff); e.set(cx - 2, cy - 1, 0xf0f0ff);
  }
  // ---------------- small bits of skin: nose, ears, neck
  { const sk = p.R('SKIN'); sk.fill(SK, (xx, yy) => 4.4 + Math.cos((sk.deg(xx) * Math.PI) / 180) * 1.2 - yy * 0.05 + (hash(xx, yy) - 0.5) * 0.4); sk.blend(sk.w / 2, sk.h - 2, 0x2a0a0a, 0.6); sk.blend(sk.w / 2 + 3, sk.h - 2, 0x2a0a0a, 0.6); }
  {
    const nk = p.R('NECK');
    nk.fill(SK, (xx, yy) => 3.6 + Math.cos((nk.deg(xx) * Math.PI) / 180) * 1.1 + (hash(xx, yy) - 0.5) * 0.5 + (yy % 3 === 1 ? -0.6 : 0));
    for (let xx = 0; xx < nk.w; xx++) { nk.set(xx, nk.h - 1, mixHex(K.shirt, 0x000000, 0.2)); nk.set(xx, nk.h - 2, (xx & 1) ? K.shirt : mixHex(K.shirt, 0xffffff, 0.2)); }
  }
  // ---------------- mouth parts
  p.R('LIP').fill(makeRamp(mixHex(K.skin, 0xd04a5a, 0.42), 5, { spread: 0.5 }), (xx, yy) => 2.6 - Math.abs(yy - 3.5) * 0.35 + (hash(xx, yy) - 0.5) * 0.4);
  p.R('MOUTH').fill(makeRamp(0x3a0a12, 4, { spread: 0.5 }), (xx, yy) => 1.2 + (yy < 3 ? 0.6 : 0) + (hash(xx, yy) - 0.5) * 0.5);
  p.R('TOOTH').fill(makeRamp(0xf4eee0, 4, { spread: 0.25 }), (xx, yy) => 2.4 - yy * 0.15);
  p.R('METAL').fill(makeRamp(0xb8bcc8, 4, { spread: 0.6 }), (xx) => 1.5 + (xx % 3 === 0 ? 1.4 : 0));
  p.R('TONGUE').fill(makeRamp(0xe0607a, 5, { spread: 0.45 }), (xx, yy) => 2.6 + Math.cos((p.R('TONGUE').deg(xx) * Math.PI) / 180) * 0.9 + (xx === 4 ? -0.8 : 0) + (hash(xx, yy) - 0.5) * 0.4);
  // ---------------- the shirt: bright, jolly, printed; shorts below the hem
  {
    const sh = p.R('SHIRT'), SR = makeRamp(K.shirt, 7, { hueShift: 0.03, spread: 0.42 }), PR = makeRamp(K.pants, 6, { spread: 0.45 });
    const hemY = rowOf(sh, q.SH - 0.255 * q.b, shirtVR), belt = rowOf(sh, q.SH - 0.268 * q.b, shirtVR);
    sh.fill(SR, (xx, yy) => 3.9 + Math.cos((sh.deg(xx) * Math.PI) / 180) * 1.0 + (sh.fbm(xx, yy, 3, 2, 4 + v) - 0.5) * 0.6 + (((xx + yy) & 1) ? 0.1 : -0.06) - (yy < 2 ? 0.8 : 0));
    // the print, on the chest (front) and smaller on the back
    const P = (deg: number, hy: number) => [sh.X(deg), rowOf(sh, q.SH - hy * q.b, shirtVR)] as [number, number];
    const [cxp, cyp] = P(0, 0.12);
    const ink0 = K.ink[0], ink1 = K.ink[1];
    switch (K.print) {
      case 'sun': {
        for (let a = 0; a < 12; a++) { const A = (a / 12) * Math.PI * 2; for (let rr2 = 6; rr2 < 9.5; rr2 += 0.5) sh.set(cxp + Math.cos(A) * rr2, cyp + Math.sin(A) * rr2 * 0.75, ink0); }
        sh.ellipse(cxp, cyp, 5.5, 4.3, ink0); sh.ellipse(cxp, cyp, 4.6, 3.6, mixHex(ink0, 0xffff80, 0.4));
        sh.set(cxp - 2, cyp - 1, 0x2a1a0a); sh.set(cxp + 2, cyp - 1, 0x2a1a0a);
        for (let t = -2; t <= 2; t++) sh.set(cxp + t, cyp + 1.5 + (t * t) * 0.18, ink1);
        break;
      }
      case 'dots': for (let i = 0; i < 40; i++) { const xx = hash(i, 3) * sh.w, yy = hash(i, 5) * (hemY - 2); sh.ellipse(xx, yy, 1.6, 1.3, i % 3 ? ink0 : ink1); } break;
      case 'stars': {
        const star = (cx: number, cy: number, rS: number, c: number) => { for (let a = 0; a < 10; a++) { const A = -Math.PI / 2 + (a / 10) * Math.PI * 2, R2 = a % 2 ? rS * 0.45 : rS; sh.line(cx, cy, cx + Math.cos(A) * R2, cy + Math.sin(A) * R2 * 0.8, c); } };
        star(cxp, cyp, 6, ink0); for (let i = 0; i < 14; i++) star(hash(i, 8) * sh.w, 2 + hash(i, 9) * (hemY - 5), 2, i % 2 ? ink0 : ink1);
        break;
      }
      case 'dino': {
        const dino = (cx: number, cy: number, f: number) => { sh.ellipse(cx, cy, 4 * f, 2.2 * f, ink0); sh.ellipse(cx + 3.6 * f, cy - 2.2 * f, 1.6 * f, 1.3 * f, ink0); sh.rect(cx + 2.5 * f, cy - 2.4 * f, 1.4 * f, 2.4 * f, ink0); sh.line(cx - 4 * f, cy, cx - 6.5 * f, cy - 1.5 * f, ink0); for (const lx of [-2, 1.5]) sh.rect(cx + lx * f, cy + 1.4 * f, 1.2 * f, 2.2 * f, ink0); for (let k2 = -2; k2 <= 1; k2++) sh.set(cx + k2 * 1.4 * f, cy - 2.4 * f, ink1); sh.set(cx + 4 * f, cy - 2.6 * f, 0x101010); };
        dino(cxp, cyp, 1.4); for (let i = 0; i < 6; i++) dino(hash(i, 21) * sh.w, 3 + hash(i, 22) * (hemY - 7), 0.7);
        break;
      }
      case 'hearts': {
        const heart = (cx: number, cy: number, f: number, c: number) => { sh.ellipse(cx - 1.3 * f, cy - 0.8 * f, 1.5 * f, 1.4 * f, c); sh.ellipse(cx + 1.3 * f, cy - 0.8 * f, 1.5 * f, 1.4 * f, c); for (let k2 = 0; k2 < 3 * f; k2++) sh.hline(cx - 2.6 * f + k2 * 0.85, cx + 2.6 * f - k2 * 0.85, cy + k2, c); };
        heart(cxp, cyp, 2.2, ink0); for (let i = 0; i < 18; i++) heart(hash(i, 31) * sh.w, 2 + hash(i, 32) * (hemY - 5), 0.7, i % 3 ? ink0 : ink1);
        break;
      }
      case 'rainbow': {
        const cols = [0xe02a2a, 0xff8a1a, 0xffd21a, 0x2aa84a, ink0, 0x7a4ae0];
        cols.forEach((c, i) => { for (let a = Math.PI; a <= Math.PI * 2; a += 0.05) for (let w = 0; w < 1.2; w += 0.5) sh.set(cxp + Math.cos(a) * (10 - i * 1.3 - w), cyp + 3 + Math.sin(a) * (7 - i * 1.0 - w * 0.7), c); });
        for (const ox of [-9, 9]) { sh.ellipse(cxp + ox, cyp + 3, 3, 1.8, ink1); sh.ellipse(cxp + ox + (ox > 0 ? -1.5 : 1.5), cyp + 2, 2, 1.6, ink1); }
        break;
      }
    }
    // a juice stain, a crumb of something
    sh.glow(sh.X(18 - v * 4), rowOf(sh, q.SH - 0.2 * q.b, shirtVR), 3, 2, mixHex(K.shirt, 0x8a2a3a, 0.5), 0.5);
    // ribbed collar
    for (let xx = 0; xx < sh.w; xx++) for (let yy = 0; yy < 3; yy++) sh.set(xx, yy, (xx & 1) ? mixHex(K.shirt, 0xffffff, 0.25) : K.shirt);
    // hem, a sliver of tummy on the chubby ones, the shorts with a waistband and a fly seam
    for (let yy = Math.floor(hemY); yy < sh.h; yy++) for (let xx = 0; xx < sh.w; xx++) {
      const deg = sh.deg(xx);
      if (yy === Math.floor(hemY)) { sh.set(xx, yy, SR[1]); continue; }
      if (q.g > 1.2 && yy < belt && Math.abs(deg) < 70) { sh.put(xx, yy, SK, 4.6 + Math.cos(deg * D2R) * 0.8, 0.5); if (Math.abs(deg) < 3 && yy === Math.floor(hemY) + 2) sh.set(xx, yy, dark); continue; }
      sh.put(xx, yy, PR, 3.2 + Math.cos(deg * D2R) * 0.9 + ((xx + yy) % 4 === 0 ? 0.3 : 0) + (yy < belt + 2 ? 0.6 : 0), 0.5);
      if (Math.abs(deg) < 2 && yy > belt + 3) sh.set(xx, yy, PR[1]);
    }
  }
  // ---------------- arms: sleeve, then bare arm with a scabbed elbow
  for (const [sd, k] of SIDES) {
    const ar = p.R('ARM_' + sd), SR = makeRamp(K.shirt, 7, { hueShift: 0.03, spread: 0.42 });
    const hem = rowOf(ar, -0.085 * q.b, armVR);
    ar.fill(SK, (xx, yy) => 4.3 + Math.cos((ar.deg(xx) * Math.PI) / 180) * 1.1 + (ar.fbm(xx, yy, 3, 2, 11 + v) - 0.5) * 0.5);
    for (let yy = 0; yy < hem; yy++) for (let xx = 0; xx < ar.w; xx++) ar.put(xx, yy, SR, 3.8 + Math.cos((ar.deg(xx) * Math.PI) / 180) * 1.0 + (yy >= hem - 1 ? -1.2 : 0), 0.5);
    if (K.print === 'dots' || K.print === 'stars' || K.print === 'hearts') for (let i = 0; i < 5; i++) ar.ellipse(hash(i, 41 + k) * ar.w, hash(i, 43) * (hem - 2), 1.2, 1, K.ink[i % 2]);
    const ex = ar.X(180), ey = rowOf(ar, -0.16 * q.b, armVR);
    if (k > 0) { ar.ellipse(ex, ey, 1.6, 1.2, 0x9a3a2a); ar.set(ex, ey, 0x6a1a10); }
    else for (let i = 0; i < 4; i++) ar.line(ar.X(-20 + i * 9), rowOf(ar, -0.24 * q.b, armVR), ar.X(-14 + i * 9), rowOf(ar, -0.26 * q.b, armVR), [0x2a4ad8, 0xe02a2a, 0x2aa84a, 0x8a2ad8][i], 0.8);
  }
  // ---------------- legs: shorts, knees, plasters, socks
  for (const [sd, k] of SIDES) {
    const lr = p.R('LEG_' + sd), PR = makeRamp(K.pants, 6, { spread: 0.45 });
    const hem = rowOf(lr, -0.11 * q.b, legVR), sockTop = rowOf(lr, -0.39 * q.b + 0.05, legVR);
    lr.fill(SK, (xx, yy) => 4.3 + Math.cos((lr.deg(xx) * Math.PI) / 180) * 1.1 + (lr.fbm(xx, yy, 3, 2, 17 + v) - 0.5) * 0.5);
    for (let yy = 0; yy < hem; yy++) for (let xx = 0; xx < lr.w; xx++) lr.put(xx, yy, PR, 3.2 + Math.cos((lr.deg(xx) * Math.PI) / 180) * 1.0 + (yy >= hem - 1 ? -1 : 0) + ((xx + yy) % 4 === 0 ? 0.3 : 0), 0.5);
    const kx = lr.X(0), ky = rowOf(lr, -0.2 * q.b, legVR);
    lr.glow(kx, ky, 2.5, 1.5, mixHex(K.skin, 0xc85a5a, 0.4), 0.5);
    if (K.plaster && k > 0) { lr.rect(kx - 2, ky - 1, 5, 3, 0xe8c8a0); lr.rect(kx - 0.5, ky - 0.5, 2, 2, 0xd8b088); }
    else if (hash(v, k) < 0.5) { lr.ellipse(kx + 1, ky, 1.2, 1, 0x8a2a1a); }
    for (let yy = Math.floor(sockTop); yy < lr.h; yy++) for (let xx = 0; xx < lr.w; xx++) {
      const stripe = yy - Math.floor(sockTop) === 1 || yy - Math.floor(sockTop) === 3;
      lr.set(xx, yy, stripe ? K.sock[1] : mixHex(K.sock[0], 0x8a8a90, (1 - Math.cos((lr.deg(xx) * Math.PI) / 180)) * 0.12));
    }
  }
  // ---------------- hands: a little grubby, sticky with sugar
  for (const sd of ['L', 'R']) { const hd = p.R('HAND_' + sd); hd.fill(SK, (xx, yy) => 4.2 + Math.cos((hd.deg(xx) * Math.PI) / 180) * 1.0 - yy * 0.04 + (hash(xx, yy + 3) - 0.5) * 0.6); for (let i = 0; i < 4; i++) hd.blend(hash(i, 51) * hd.w, hash(i, 53) * hd.h, i % 2 ? K.pop[0] : 0x5a4030, 0.35); }
  // ---------------- sneakers: velcro strap, rubber toe, thick sole
  for (const sd of ['L', 'R']) {
    const so = p.R('SHOE_' + sd), UR = makeRamp(K.shoe[0], 6, { spread: 0.45 }), WR = makeRamp(K.shoe[1], 4, { spread: 0.3 });
    for (let yy = 0; yy < so.h; yy++) for (let xx = 0; xx < so.w; xx++) {
      const f = yy / so.h, th = (so.deg(xx) * Math.PI) / 180;
      if (f > 0.75) so.put(xx, yy, WR, 2.4 + Math.cos(th) * 0.4 - (f > 0.9 ? 1.2 : 0), 0.4);
      else if (f < 0.22 && xx > so.w * 0.25 && xx < so.w * 0.75) so.put(xx, yy, WR, 2.8 - f, 0.4);
      else so.put(xx, yy, UR, 3.4 + Math.cos(th) * 0.8 + ((xx + yy) % 3 === 0 ? 0.25 : 0), 0.5);
    }
    for (let xx = Math.floor(so.w * 0.3); xx < so.w * 0.7; xx++) { so.set(xx, Math.floor(so.h * 0.38), WR[1]); so.set(xx, Math.floor(so.h * 0.38) + 1, WR[2]); }
  }
  // ---------------- the beanie: four panels, piping, a band; the bill; the blades
  {
    const bn = p.R('BEANIE');
    for (let yy = 0; yy < bn.h; yy++) for (let xx = 0; xx < bn.w; xx++) {
      const deg = bn.deg(xx), f = 1 - yy / bn.h, panel = Math.floor(((deg + 180 + 45) % 360) / 90);
      const R2 = makeRamp(K.cap[panel], 5, { spread: 0.4 });
      bn.put(xx, yy, R2, 2.6 + Math.cos(deg * D2R) * 0.5 + f * 0.8 + (hash(xx >> 1, yy >> 1) - 0.5) * 0.5, 0.5);
      if (Math.abs(((deg + 180 + 45) % 90) - 45) > 43.2) bn.set(xx, yy, 0xf8f4ec);
      if (yy > bn.h - 4) bn.set(xx, yy, (xx & 1) ? K.cap[3] : mixHex(K.cap[3], 0x000000, 0.2));
    }
    const brR = makeRamp(K.brim, 5, { spread: 0.4 });
    p.R('BRIM').fill(brR, (xx, yy) => 2.8 - Math.abs(yy - 3.5) * 0.2 + (yy === 7 ? -1 : 0));
    p.R('PROP').fill(makeRamp(K.blades[0], 5, { spread: 0.45 }), (xx) => 1.8 + (xx / 16) * 1.8);
    p.R('PROP2').fill(makeRamp(K.blades[1], 5, { spread: 0.45 }), (xx) => 1.8 + (xx / 16) * 1.8);
    p.R('STICK').fill(makeRamp(0xf0ece4, 4, { spread: 0.3 }), (xx, yy) => 2.2 + Math.cos((p.R('STICK').deg(xx) * Math.PI) / 180) * 0.6 - yy * 0.05);
  }
  // ---------------- the lollipop: a glassy spiral, licked flat on one side
  {
    const po = p.R('POP');
    const A = makeRamp(K.pop[0], 5, { spread: 0.5 }), Bc = makeRamp(K.pop[1], 4, { spread: 0.3 });
    for (let yy = 0; yy < po.h; yy++) for (let xx = 0; xx < po.w; xx++) {
      const vv = 1 - yy / po.h, ang = (xx / po.w) * Math.PI * 2, rad = Math.abs(vv - 0.5) * 2;
      const sp = ((ang / (Math.PI * 2)) * 3 + rad * 3.4 + (vv > 0.5 ? 0 : 0.5)) % 1;
      const RR = sp < 0.5 ? A : Bc;
      po.put(xx, yy, RR, RR.length * 0.55 + (1 - rad) * 0.9 + (hash(xx, yy) - 0.5) * 0.4, 0.4);
      if (hash(xx * 3, yy) < 0.04) po.set(xx, yy, 0xffffff);
    }
  }
  paintCap(p.R('CAP'), K.skin, 0xc83a3a, 0x5a0a10);
}

// ------------------------------------------------------------------ the flush: a red, veined shell over the head that shows as it charges
function layoutF(p: Page) { p.reg('FLUSH', 48, 32); p.reg('CAP', 8, 8); }
function buildF(B: SkinB, x: BuildCtx) {
  const q = GEO[x.variant], H = x.bi('head');
  const th = Array.from({ length: 33 }, (_, j) => -180 + j * 11.25), ph = [-80, -68, -56, -44, -32, -20, -8, 4, 16, 28, 40, 52, 64, 76];
  const rings = ph.map((p0, i) => ({ pts: th.map((t) => headPt(q, t, p0, 1.008)), v: i / (ph.length - 1), w: [H, 1] as Wt }));
  B.loft(rings, usFor(32), x.R('FLUSH'), 1, { end: headPt(q, 0, 90, 1.008), endW: [H, 1], endV: 1, start: headPt(q, 0, -88, 1.0), startW: [H, 1], startV: 0 });
}
function paintF(p: Page) {
  const f = p.R('FLUSH');
  const R = makeRamp(0xd8202a, 6, { spread: 0.55, hueShift: 0.05 });
  f.fill(R, (xx, yy) => 3 + (f.fbm(xx, yy, 3, 3, 71) - 0.5) * 1.6 + (yy < 6 ? 0.8 : 0));
  for (let i = 0; i < 26; i++) f.crack(hash(i, 1) * f.w, hash(i, 2) * f.h, 10 + Math.floor(hash(i, 3) * 14), 70 + hash(i, 4) * 40, 0x5a0414, 80 + i, 0.75, 0.3);
  for (let i = 0; i < 14; i++) f.glow(hash(i, 5) * f.w, hash(i, 6) * f.h, 3, 2, 0xff8a6a, 0.4);
  paintCap(p.R('CAP'), 0xd8202a, 0xd8202a, 0x5a0414);
}
const FLUSH_KIT: KitDef = { key: 'timmy_flush', variants: NV, W: 64, H: 64, bones: bonesT, layout: layoutF, build: buildF, paint: paintF, sphere: [0, 1.4, 0, 1.2] };

export const TIMMY_KIT: KitDef = {
  key: 'timmy', variants: NV, W: 256, H: 256, bones: bonesT, layout: layoutT, build: buildT, paint: paintT, sphere: [0, 1.1, 0, 1.25],
  decorate: (rig, e) => { const m = attachFilm(rig, FLUSH_KIT, e.variant, { opacity: 0, edge: 1.2, spec: 1.4, rim: 0.4 }); m.visible = false; rig.kit.m.flush = m; },
};

/** a Timmy rig (variant 0..5) */
export function buildTimmy(variant = 0): KitRig { return buildKitRig(TIMMY_KIT, variant, 1.6); }

// ------------------------------------------------------------------ the pose
export interface TimmyDrive {
  t: number; dt: number;
  /** ground speed (m/s) and local acceleration (x left, z forward) of the floating body */
  speed: number; ax: number; az: number;
  /** mode: '' | 'wave' | 'follow' | 'beg' | 'candy' | 'eat' | 'charge' | 'hide' | 'rise' | 'lick' | 'giggle' */
  md: string;
  /** charge 0..1 (swelling), hidden in the balls 0..1, death 0..1, popped (head gone), deflated 0..1 */
  ch: number; hide: number; dead: number; popped: boolean; defl: number;
  flinch: number; seed: number; variant: number;
  /** head yaw / pitch toward whoever it is looking at (radians, rig space) */
  look: [number, number];
}
const e3 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const p0 = (o: THREE.Object3D) => o.userData.p0 as THREE.Vector3;
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));

function poseT(Kr: KitRig, d: TimmyDrive) {
  const P = Kr.parts, ud = Kr.kit.m as Record<string, number>, t = d.t, dt = Math.min(0.05, d.dt), sd = d.seed * 13;
  const q = GEO[Kr.kit.entry.variant], R = q.R;
  const is = (m: string) => (d.md === m ? 1 : 0);
  const mv = clamp01(d.speed / 1.2) * (1 - d.dead);
  const wave = sm(ud, 'wv', is('wave'), 5, dt), beg = sm(ud, 'bg', is('beg') + is('candy') * 0.4, 4, dt), eat = sm(ud, 'et', is('eat'), 5, dt);
  const chg = sm(ud, 'cg', is('charge'), 6, dt), lickM = sm(ud, 'lk', is('lick') + is('eat') * 0.5, 5, dt), fol = sm(ud, 'fl', is('follow') + is('beg') * 0.5, 3, dt);
  const ch = d.ch, c2 = ch * ch, alive = 1 - d.dead;
  const hide = sm(ud, 'hd', d.hide, d.hide > (ud.hd ?? 0) ? 1.6 : 3.2, dt);
  // ---- the balloon bobs; the little body swings under it on the neck (a damped pendulum)
  const bob = (Math.sin(t * 1.35 + sd) * 0.05 + Math.sin(t * 2.9 + sd * 2) * 0.018) * alive * (1 - hide * 0.7) + Math.sin(t * 9 + sd) * 0.02 * c2;
  const bobV = Math.cos(t * 1.35 + sd) * 0.0675 * alive;
  const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
  const w2 = 17, damp = 1.5 + d.dead * 6;
  let px = ud.px ?? 0, pv = ud.pv ?? 0, rz = ud.rz ?? 0, rv = ud.rv ?? 0;
  const drag = 0.07 * d.speed;
  for (let i = 0; i < n; i++) {
    pv += (-w2 * (px - drag) - damp * pv + d.az / 0.55) * h; px += pv * h;
    rv += (-w2 * rz - damp * rv - d.ax / 0.55) * h; rz += rv * h;
  }
  // kicks and giggles feed the swing a little; charging makes it thrash
  if (d.dead < 0.5) { pv += Math.sin(t * 2.3 + sd) * 0.6 * h * n * (0.3 + 2.5 * c2); rv += Math.sin(t * 3.1 + sd * 3) * 0.5 * h * n * (0.2 + 3 * c2); }
  if (d.flinch > 0 && !ud.hitK) { ud.hitK = 1; pv += (Math.random() - 0.5) * 4; rv += (Math.random() - 0.5) * 4; ud.gig = 1; } else if (d.flinch <= 0) ud.hitK = 0;
  px = Math.max(-0.9, Math.min(0.9, px)); rz = Math.max(-0.9, Math.min(0.9, rz));
  ud.px = px; ud.pv = pv; ud.rz = rz; ud.rv = rv;
  // ---- the head: swelling, squash and stretch, wobble
  const gig = ud.gig = Math.max(0, (ud.gig ?? 0) - dt * 1.4);
  const S = 1 + 0.78 * Math.pow(ch, 1.35) - d.defl * 0.42;
  const wob = c2 * 0.075 * (1 + d.flinch), wf = 7 + 24 * ch;
  const stretch = bobV * 0.25 + gig * 0.06 * Math.sin(t * 34);
  const sx = S * (1 + wob * Math.sin(t * wf + sd) - stretch * 0.5 + d.defl * 0.12 * Math.sin(t * 0.5));
  const sy = S * (1 + wob * Math.sin(t * wf * 1.13 + sd + 2) + stretch - d.defl * 0.3);
  const sz = S * (1 + wob * Math.sin(t * wf * 0.91 + sd + 4) - stretch * 0.5);
  const head = P.head;
  head.scale.set(Math.max(0.1, sx), Math.max(0.1, sy), Math.max(0.1, sz));
  const lookYaw = d.look[0] * 0.55 * alive * (1 - chg * 0.5), lookPitch = d.look[1] * 0.4 * alive;
  head.rotation.set(-lookPitch + 0.12 * mv + Math.sin(t * 0.7 + sd) * 0.04 * alive + wob * Math.sin(t * wf * 0.7) * 1.5 - 0.15 * eat + 0.12 * lickM,
    lookYaw + Math.sin(t * 0.43 + sd) * 0.08 * alive * (1 - fol),
    Math.sin(t * 0.61 + sd) * 0.06 * alive + rz * 0.18 + 0.22 * d.dead + (q.K.lazy ? 0.05 : 0) + gig * 0.1 * Math.sin(t * 21));
  // float: the anchor; hidden it sinks into the balls up to its hat; dead it lies on the floor
  const fl = P.float;
  const deadY = 0.1 + (d.popped ? 0 : R * 0.45 * (1 - d.defl * 0.5));
  fl.position.set(0, p0(fl).y + bob - hide * (q.HY - R * 0.82) + (deadY - p0(fl).y) * d.dead + 0.04 * chg * Math.sin(t * 11), 0);
  fl.rotation.set(0, 0, 0);
  // the neck follows the bottom of the balloon down as it swells
  const nk = P.neck;
  nk.position.set(0, -R * 0.95 * sy, 0);
  const deadSwing = -1.45;
  nk.rotation.set(px * alive + deadSwing * d.dead + 0.1 * beg, 0, rz * alive + 0.12 * d.dead);
  P.chest.rotation.set(-px * 0.25 * alive + 0.15 * beg - 0.1 * d.dead, Math.sin(t * 0.9 + sd) * 0.08 * alive, -rz * 0.3 * alive);
  P.spine.rotation.set(-px * 0.15 + Math.sin(t * 2.3 + sd) * 0.05 * c2 * 4, 0, -rz * 0.15);
  P.hips.rotation.set(0.12 * alive + Math.sin(t * 1.9 + sd) * 0.06 * alive, 0, 0);
  // ---- legs: dangling, kicking at nothing; paddling when it drifts; thrashing when it charges
  const kickF = 2.2 + 3 * mv + 9 * chg, kickA = 0.22 + 0.25 * mv + 0.7 * chg * (0.4 + ch);
  for (const [s, k] of SIDES) {
    const ph = t * kickF + (k > 0 ? 0 : Math.PI) + sd;
    const kk = Math.sin(ph) * kickA * alive;
    P['thigh' + s].rotation.set(-0.28 * alive - 0.35 * beg + kk - 0.5 * d.dead, 0, k * (0.06 + 0.05 * Math.sin(t * 1.3 + k)) * alive + k * 0.25 * d.dead);
    P['shin' + s].rotation.set(0.45 * alive + Math.max(0, -kk) * 1.1 + 0.25 * Math.sin(ph + 1.2) * alive * (0.4 + chg) + 0.1 * d.dead, 0, 0);
    P['foot' + s].rotation.set(0.75 * alive + Math.sin(ph + 2) * 0.2 * alive + 0.6 * d.dead, k * 0.15 * alive, 0);
  }
  // ---- arms: the right hand holds the lollipop up (and to the mouth to lick); the left waves, begs, swings
  const lick = lickM * (0.5 + 0.5 * Math.sin(t * 3.2 + sd));
  const flail = chg * (0.5 + ch);
  {
    const ax = -0.42 - 0.55 * lick - 0.2 * beg + flail * 0.7 * Math.sin(t * 13 + sd), az = -0.18 - flail * (0.9 + 0.6 * Math.sin(t * 11));
    P.uarmR.rotation.set(ax * alive + 0.3 * d.dead, 0.1, az * alive - 1.1 * d.dead);
    P.farmR.rotation.set((-1.45 - 0.35 * lick + flail * 0.8 * Math.sin(t * 15)) * alive - 0.2 * d.dead, -0.2 * lick, 0);
    P.handR.rotation.set((0.2 + 0.2 * lick) * alive, 0.35 + 0.3 * lick, -0.15);
    P.fing1R.rotation.set(0, 0, -1.25 * alive); P.fing2R.rotation.set(0, 0, -1.1 * alive); P.thumbR.rotation.set(0.5 * alive, 0, -0.6 * alive);
  }
  {
    const wv = Math.sin(t * 9.5 + sd);
    const swing = Math.sin(t * 1.6 + sd) * 0.18 * (1 - wave) * (1 - beg);
    const ax = (swing - 0.85 * beg - 0.15 * eat + flail * Math.sin(t * 12.5 + 1)) * alive + 0.4 * d.dead;
    const az = (0.12 + 2.45 * wave + 0.25 * beg + flail * (1 + 0.6 * Math.sin(t * 10 + 2))) * alive + 1.2 * d.dead;
    P.uarmL.rotation.set(ax, 0, az);
    P.farmL.rotation.set((-0.25 - 0.5 * beg - 1.2 * eat) * alive - 0.3 * wave, 0, (0.45 * wv * wave + 0.3 * wave) * alive);
    P.handL.rotation.set(0.25 * beg * Math.sin(t * 6), 0.3 * wave * wv, 0.2 * wave);
    const curl = (0.55 - 0.45 * wave - 0.3 * beg * (0.5 + 0.5 * Math.sin(t * 6))) * alive + 0.3 * d.dead;
    P.fing1L.rotation.set(0, 0, curl * 0.8); P.fing2L.rotation.set(0, 0, curl * 0.7); P.thumbL.rotation.set(0.2, 0, -curl * 0.4);
  }
  // ---- the face: grin, giggles (the jaw flutters), chewing, a rictus as it swells; the tongue licks
  const gg = Math.max(gig, is('giggle'), 0.6 * chg);
  const jaw = (0.02 + 0.16 * gg * (0.5 + 0.5 * Math.sin(t * 30 + sd)) + 0.22 * eat * (0.5 + 0.5 * Math.sin(t * 7)) + 0.38 * c2 * chg + 0.1 * beg + 0.12 * lick) * alive + 0.3 * d.dead;
  P.jaw.rotation.set(jaw, 0, 0);
  const tg = P.tongue, tn = headN(0, F.tongue);
  const lk = Math.max(lick * 1.1, eat * 0.6) * alive + 0.6 * d.dead * (d.popped ? 0 : 1);
  tg.position.set(p0(tg).x + tn[0] * 0.03 * lk, p0(tg).y + tn[1] * 0.03 * lk - 0.006 * lk, p0(tg).z + tn[2] * 0.035 * lk);
  tg.rotation.set(-0.4 * lk * Math.sin(t * 6 + sd), 0, 0);
  // eyes: they follow you; they bulge as it swells; one wanders on the lazy-eyed kid
  const eyeB = 1 + 0.45 * c2 + 0.25 * d.defl;
  for (const [s, k] of SIDES) {
    const E = P['eye' + s];
    const drift = q.K.lazy && k < 0 ? 0.35 + Math.sin(t * 0.4) * 0.15 : 0;
    E.rotation.set(-d.look[1] * 0.6 * alive + 0.5 * d.dead, (d.look[0] * 0.5 - lookYaw * 0.4) * alive + drift * -1 + Math.sin(t * 3.7 + sd + k) * 0.06 * chg, 0);
    E.scale.setScalar(eyeB);
  }
  // ---- the beanie stays the size it is (perched ever smaller on the swelling head); the propeller spins
  const cap = P.cap;
  cap.scale.set(1 / Math.max(0.2, sx), 1 / Math.max(0.2, sy), 1 / Math.max(0.2, sz));
  cap.rotation.set(-0.06 + Math.sin(t * 1.1 + sd) * 0.04 + wob * 2 * Math.sin(t * wf * 1.3), 0, rz * -0.1 + 0.04 * Math.sin(t * 0.8));
  const spin = (4.5 + 9 * mv + 70 * ch * chg + 6 * gig) * alive * (1 - hide * 0.7) + (d.dead > 0 && d.dead < 1 ? 3 : 0);
  ud.pa = ((ud.pa ?? sd) + dt * spin) % (Math.PI * 2);
  P.prop.rotation.set(0, ud.pa, 0);
  // ---- the lollipop stays in the fist; it falls out when it dies
  P.pop.visible = d.dead < 0.5 || !!ud.keepPop;
  // ---- the flush: red, veined, showing through as it fills
  const fm = Kr.kit.m.flush as THREE.SkinnedMesh | undefined;
  if (fm) {
    const op0 = 0.88 * e3((ch - 0.1) / 0.8) * (1 - d.dead) + 0.1 * Math.max(0, Math.sin(t * (5 + 12 * ch))) * c2;
    fm.visible = op0 > 0.015 && head.visible;
    (fm.material as THREE.MeshLambertMaterial).opacity = op0;
  }
  // the head pops: gone (the gore system takes it; this keeps it gone everywhere)
  if (d.popped) head.visible = false;
}

// ------------------------------------------------------------------ stand-alone pose API
export type TimmyPose = 'idle' | 'drift' | 'wave' | 'follow' | 'lick' | 'giggle' | 'beg' | 'eat' | 'charge' | 'hide' | 'rise' | 'deflate' | 'popped' | 'dead';
/**
 * Animate a Timmy rig with no game running: call every frame with a running
 * clock. `ch` overrides the charge for 'charge' (default: swells over 6 s and
 * starts again); `variant` switches the kid; `look` aims the head and eyes.
 */
export function poseTimmy(rig: KitRig, t: number, dt: number, pose: TimmyPose = 'idle', o: { ch?: number; speed?: number; variant?: number; look?: [number, number]; ax?: number; az?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== ((o.variant % NV) + NV) % NV) { kitPersonalize(rig, o.variant); filmPersonalize(rig, o.variant); }
  const ud = rig.kit.m as Record<string, number>;
  if (rig.parts.head.visible === false && pose !== 'popped') rig.parts.head.visible = true;
  kitSync(rig);
  const speed = o.speed ?? (pose === 'drift' || pose === 'follow' ? 0.9 : pose === 'charge' ? 1.4 : 0);
  // a gentle fake sway for the pendulum when it drifts
  const az = o.az ?? (speed > 0 ? Math.sin(t * 0.8) * 0.6 : 0), ax = o.ax ?? (speed > 0 ? Math.sin(t * 0.55) * 0.4 : 0);
  if (pose === 'giggle' && Math.floor(t / 2.2) !== ud.gk) { ud.gk = Math.floor(t / 2.2); ud.gig = 1; }
  const ch = pose === 'charge' ? (o.ch ?? Math.min(1, (t % 6.5) / 6)) : 0;
  const deadish = pose === 'popped' || pose === 'dead' || pose === 'deflate';
  if (!deadish) delete ud.dk0; else if (ud.dk0 === undefined) ud.dk0 = t;
  const dk = deadish ? Math.min(1, (t - ud.dk0) * 1.6) : 0;
  const md = pose === 'drift' || pose === 'idle' || deadish ? '' : pose === 'rise' ? '' : pose;
  const hide = pose === 'hide' ? 1 : pose === 'rise' ? Math.max(0, 1 - (t % 4) / 1.2) : 0;
  poseT(rig, {
    t, dt, speed, ax, az, md, ch, hide, dead: deadish ? e3(dk) : 0, popped: pose === 'popped', defl: pose === 'deflate' ? e3(dk) : 0,
    flinch: 0, seed: 0.37, variant: rig.kit.entry.variant, look: o.look ?? [Math.sin(t * 0.3) * 0.4, 0.15],
  });
}

// ------------------------------------------------------------------ the burst (any peer: particles; host: damage)
const CONFETTI: BloodKind = { ...KINDS.stuffing, key: 'stuffing', drop: [0xff2a4a, 0xffd21a, 0x2a8aff, 0x3ad84a, 0xff6ad8, 0xff8a1a, 0xffffff, 0x8a5aff], mist: 0xfff0f8 };
const CANDY: BloodKind = { ...KINDS.shell, key: 'shell', drop: [0xff3a6a, 0xffe03a, 0x4ab8ff, 0x6ae05a, 0xf4f0ff, 0xc85aff], mist: 0xffd8e8 };
function burstFx(x: number, y: number, z: number, zk: string, power: number) {
  const gore = G?.gore;
  if (!gore || G.local?.zoneKey !== zk) return;
  const m = gore.mul ?? 1;
  for (let i = 0; i < Math.round(170 * power); i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, sp = 2.5 + Math.random() * 5.5 * power, hz = Math.sqrt(1 - u * u);
    gore.emit(CONFETTI, 0xffffff, x, y, z, Math.cos(a) * hz * sp, Math.abs(u) * sp * 0.8 + 1.5, Math.sin(a) * hz * sp, 0.022 + Math.random() * 0.02, 1.4 + Math.random() * 1.6, 0);
  }
  for (let i = 0; i < Math.round(46 * power); i++) {
    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5 * power;
    gore.emit(CANDY, 0xffffff, x, y - 0.1, z, Math.cos(a) * sp, 1 + Math.random() * 3.5, Math.sin(a) * sp, 0.028 + Math.random() * 0.02, 1.2 + Math.random(), 0);
  }
  const K = KINDS.red;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.random(); gore.jet(K, 0xffffff, x, y, z, Math.cos(a), Math.sin(a), Math.round(14 * m * power), 4.2 * power, 0.5, 2.2, 0.034, 0.08); }
  gore.mist(K, 0xffffff, x, y, z, 0, 1, Math.round(26 * m * power), 2.4);
  gore.lensNear?.(x, z, 1.4 * power, K);
  const p = G.local;
  if (p && Math.hypot(p.x - x, p.z - z) < 9 && G.pr) G.pr.shake = Math.min(2.5, (G.pr.shake ?? 0) + 1.6 * power * (1 - Math.hypot(p.x - x, p.z - z) / 9));
}

/**
 * A self-contained confetti / candy / blood burst for staging (no game): adds an
 * instanced cloud under `parent` at `at`; call the returned function every frame
 * with dt; it returns false (and removes itself) when the last piece has settled.
 */
export function timmyBurst(parent: THREE.Object3D, at: THREE.Vector3, power = 1): (dt: number) => boolean {
  const N = Math.round(320 * power), cols = [...CONFETTI.drop, ...CANDY.drop, 0x8a1018, 0x6a0a10, 0xa01820];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  const P = new Float32Array(N * 3), Vv = new Float32Array(N * 3), Sz = new Float32Array(N), Kd = new Uint8Array(N), Rt = new Float32Array(N);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const kind = i < N * 0.6 ? 0 : i < N * 0.8 ? 1 : 2, a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, hz = Math.sqrt(1 - u * u), sp = (2 + Math.random() * 5) * power;
    P[i * 3] = at.x; P[i * 3 + 1] = at.y; P[i * 3 + 2] = at.z;
    Vv[i * 3] = Math.cos(a) * hz * sp; Vv[i * 3 + 1] = Math.abs(u) * sp + 1.2; Vv[i * 3 + 2] = Math.sin(a) * hz * sp;
    Kd[i] = kind; Sz[i] = kind === 0 ? 0.03 : kind === 1 ? 0.035 : 0.025 + Math.random() * 0.03; Rt[i] = Math.random() * 10;
    mesh.setColorAt(i, c.set(kind === 0 ? CONFETTI.drop[i % CONFETTI.drop.length] : kind === 1 ? CANDY.drop[i % CANDY.drop.length] : cols[cols.length - 1 - (i % 3)]));
  }
  parent.add(mesh);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Sv = new THREE.Vector3(), Pv = new THREE.Vector3();
  let life = 0;
  return (dt: number) => {
    life += dt;
    let moving = 0;
    for (let i = 0; i < N; i++) {
      const k = Kd[i], j = i * 3;
      if (P[j + 1] > 0.005) {
        moving++;
        const drag = k === 0 ? 2.2 : 0.4;
        Vv[j] -= Vv[j] * drag * dt; Vv[j + 2] -= Vv[j + 2] * drag * dt;
        Vv[j + 1] -= (k === 0 ? 3.2 : 9.8) * dt; if (k === 0) Vv[j + 1] = Math.max(Vv[j + 1], -0.9);
        P[j] += Vv[j] * dt; P[j + 1] = Math.max(0.004, P[j + 1] + Vv[j + 1] * dt); P[j + 2] += Vv[j + 2] * dt;
        Rt[i] += dt * (k === 0 ? 9 : 4);
      }
      E.set(Rt[i], Rt[i] * 0.7, k === 0 ? Rt[i] * 1.3 : 0);
      Q.setFromEuler(E); Sv.set(Sz[i], k === 0 ? Sz[i] * 0.12 : Sz[i], Sz[i] * (k === 2 ? 1.4 : 0.8)); Pv.set(P[j], P[j + 1], P[j + 2]);
      mesh.setMatrixAt(i, M.compose(Pv, Q, Sv));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if ((!moving && life > 1) || life > 30) { parent.remove(mesh); geo.dispose(); return false; }
    return true;
  };
}

// ------------------------------------------------------------------ in-game animation
function animateTimmy(rig: Rig, c: Creature, t: number, dt: number) {
  const Kr = rig as KitRig;
  const v = Math.floor(hashId(c.id) * NV);
  if (Kr.kit.who !== c.id) { Kr.kit.who = c.id; kitPersonalize(Kr, v); filmPersonalize(Kr, v); }
  kitSync(Kr);
  const n = netOf(c), ud = Kr.kit.m as Record<string, number>, seed = hashId(c.id, 7);
  const sz = 0.92 + hashId(c.id, 3) * 0.16;
  rig.root.scale.setScalar(sz);
  // the floating body's own acceleration in its local frame (the dangling body lags it)
  const vx = ud.qx === undefined ? 0 : (c.x - ud.qx) / Math.max(1e-3, dt), vz = ud.qz === undefined ? 0 : (c.z - ud.qz) / Math.max(1e-3, dt);
  ud.qx = c.x; ud.qz = c.z;
  const fwd = vx * Math.cos(c.facing) + vz * Math.sin(c.facing), lat = vx * Math.sin(c.facing) - vz * Math.cos(c.facing);
  const ax = Math.max(-20, Math.min(20, (lat - (ud.vl ?? lat)) / Math.max(1e-3, dt))), az = Math.max(-20, Math.min(20, (fwd - (ud.vf ?? fwd)) / Math.max(1e-3, dt)));
  ud.vl = lat; ud.vf = fwd;
  const ch = sm(ud, 'chs', n.ch ?? 0, 8, dt);
  const f = fxPoll(rig, c);
  const near = c.visibleToLocal || (G.local && G.local.zoneKey === c.zoneKey && Math.hypot(G.local.x - c.x, G.local.z - c.z) < 14);
  if (f) {
    if (f.key === 'giggle') { ud.gig = 1; if (near) playAt('tim_giggle', c, 0.75, 18, 1.35 + Math.random() * 0.35); }
    else if (f.key === 'squeal') { if (near) playAt('tim_giggle_mad', c, 0.9, 20, 1.6 + ch * 0.6); }
    else if (f.key === 'lick') { if (near) playAt('tim_lick', c, 0.4, 7, 1.3); }
    else if (f.key === 'eat') { if (near) { playAt('tim_crinkle', c, 0.7, 9, 1.1); playAt('tim_coo', c, 0.6, 12, 1.2); } }
    else if (f.key === 'rise') { ud.gig = 1; if (near) { playAt('bx_balls', c, 0.9, 14, 0.9); playAt('tim_giggle', c, 0.8, 18, 1.5); } }
    else if (f.key === 'calm') { if (near) playAt('tim_coo', c, 0.7, 14, 1.15); }
    else if (f.key === 'deflate') { if (near) { playAt('tim_deflate', c, 1, 16, 1.25); playAt('tim_squeak', c, 0.6, 12, 0.6); } }
    else if (f.key === 'pop') {
      const pw = Math.max(0.3, Number(f.a?.p ?? 1));
      const hp = rig.parts.head; const wp = new THREE.Vector3(); hp.getWorldPosition(wp);
      if (!isFinite(wp.y) || wp.y < c.y + 0.3) wp.set(c.x, c.y + 1.4, c.z);
      burstFx(wp.x, wp.y, wp.z, c.zoneKey, pw);
      playAt('tim_pop', c, 1, 40, 1.15 + Math.random() * 0.15); playAt('tim_splat', c, 1, 26, 0.9); playAt('gore_burst', c, 0.9, 24, 0.8);
      setTimeout(() => { if (G.local?.zoneKey === c.zoneKey) playAt('tim_squeak', c, 0.5, 14, 2.2); }, 120);
    }
  }
  // the charge's telegraph: squeaks of stretching rubber, faster and higher; mad giggles
  if (!c.dead && n.md === 'charge' && near && t > (ud.sqT ?? 0)) { ud.sqT = t + 0.6 - ch * 0.45 + Math.random() * 0.15; playAt('tim_squeak', c, 0.45 + ch * 0.5, 20, 0.75 + ch * 1.3); if (ch > 0.3 && Math.random() < 0.3) playAt('tim_stretch', c, 0.6, 16, 0.9 + ch * 0.4); }
  if (!c.dead && near && t > (ud.idleT ?? 0) && n.md !== 'charge' && n.md !== 'hide') { ud.idleT = t + 7 + Math.random() * 9; if (Math.random() < 0.55) { ud.gig = 1; playAt('tim_giggle', c, 0.5, 16, 1.4 + Math.random() * 0.4); } else playAt('tim_coo', c, 0.45, 10, 1.15 + Math.random() * 0.2); }
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 1.8) : 0;
  const popped = !!n.pp || (c.dead && !!c.mem.sev?.includes?.('head'));
  // where it looks: whoever it is following (the local player, near enough)
  let look: [number, number] = [0, 0.1];
  const p = localIn(c);
  if (p && !c.dead) {
    const a = Math.atan2(p.z - c.z, p.x - c.x); let rel = a - c.facing; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) < 2) look = [-rel, Math.atan2(1.4 - 1.0, Math.max(0.5, dist(p, c))) * -1];
  }
  const lk = ud.lkx === undefined ? look : [ud.lkx + (look[0] - ud.lkx) * Math.min(1, dt * 5), ud.lky + (look[1] - ud.lky) * Math.min(1, dt * 5)];
  ud.lkx = lk[0]; ud.lky = lk[1];
  poseT(Kr, {
    t, dt, speed: c.speed, ax, az, md: c.dead ? '' : (n.md ?? ''), ch: c.dead ? (popped ? 0 : ch * (1 - ud.dk)) : ch, hide: c.dead ? 0 : (n.md === 'hide' ? 1 : 0),
    dead: e3(ud.dk), popped, defl: c.dead && !popped ? e3(ud.dk) : 0, flinch: flinchOf(c), seed, variant: v, look: [lk[0], lk[1]],
  });
  uprightDead(Kr, c);
  const F = Kr.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  // what the unit makes of it
  if (p && !c.dead && c.visibleToLocal) {
    const dd = dist(p, c);
    if (n.md === 'charge' && dd < 16) thinkOnce(p, 'timmy_charge', ch < 0.5 ? 'Its head is swelling. It is going red and squeaking. Get away from it, or throw it something sweet.' : 'It is going to pop. GET AWAY FROM IT.', ch < 0.5 ? 14 : 8);
    else if (n.md === 'hide' && dd < 12) thinkOnce(p, 'timmy_hide', 'There is a little propeller turning in the balls. Just the hat. Something is under there.', 70);
    else if (n.md === 'eat' && dd < 12) thinkOnce(p, 'timmy_eat', 'It took the sweet. It is sucking it and humming. It has forgotten all about me.', 50);
    else if (n.md === 'wave' && dd < 12) thinkOnce(p, 'timmy_wave', 'It is waving at me. It wants me to come and play.', 60);
    else if (n.md === 'follow' && dd < 6) thinkOnce(p, 'timmy_follow', ['It keeps following me. It giggles every time I look round.', 'It floats along behind me with its feet kicking. It wants to play.', 'Every time I stop, it stops. Every time I go, it goes.'][Math.floor(t * 0.07) % 3], 75);
    else if (dd < 9) thinkOnce(p, 'timmy', ['A little kid. A little kid with a head like a beach ball. It is floating.', 'Its head is skin. Stretched skin, shiny like a balloon. The hat is far too small for it.', 'It is licking a lollipop and looking at me.'][Math.floor(t * 0.11) % 3], 90);
  }
}

// ------------------------------------------------------------------ host brain
const EAT_T = 4.2, RISE_T = 1.3, WAVE_T = 2.4, CHARGE_T = 5.2, SUGAR_T = 42;
const isSweet = (key: string) => { const d = itemDef(key); return !!d && (d.tags?.includes('sweet') || d.tags?.includes('candy') || d.food?.ingredient === 'sweet'); };
interface Candy { x: number; z: number; uid: number; d: number }
function candyNear(c: Creature, r: number): Candy | null {
  const z = zoneOf(c);
  let best: Candy | null = null;
  for (const wi of floorItemsAround(z, c.x, c.z, r)) {
    if (!isSweet(wi.item.key)) continue;
    const d = Math.hypot(wi.x - c.x, wi.z - c.z);
    if (d < r && (!best || d < best.d)) best = { x: wi.x, z: wi.z, uid: wi.item.uid, d };
  }
  return best;
}
function holdsSweet(p: Player) { const it = (p as any).handR; return !!it && isSweet(it.key); }
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function pitAt(z: Zone, x: number, y: number) { return (z.floorAt(Math.floor(x), Math.floor(y))?.key ?? '') === 'bx_pit'; }
function nearPit(c: Creature, z: Zone, r: number): { x: number; z: number } | null {
  const pits = (z.meta as any).bxPits as [number, number, number, number][] | undefined;
  if (!pits?.length) return null;
  let best: { x: number; z: number } | null = null, bd = r;
  for (const [x0, y0, x1, y1] of pits) {
    const x = Math.max(x0 + 1, Math.min(x1 - 1, Math.floor(c.x))) + 0.5, y = Math.max(y0 + 1, Math.min(y1 - 1, Math.floor(c.z))) + 0.5;
    const jx = x + rng.float(-1.5, 1.5), jy = y + rng.float(-1.5, 1.5);
    const tx = pitAt(z, jx, jy) ? jx : x, ty = pitAt(z, jx, jy) ? jy : y;
    const d = Math.hypot(tx - c.x, ty - c.z);
    if (d < bd && pitAt(z, tx, ty)) { bd = d; best = { x: tx, z: ty }; }
  }
  return best;
}
function startCharge(c: Creature, boost = 0) {
  const n = net(c);
  if (n.md !== 'charge') { setMd(c, 'charge'); n.ch = Math.max(n.ch ?? 0, 0.02); fx(c, 'squeal'); for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 16) { ruleShown(c); break; } }
  n.ch = Math.min(1, +((n.ch ?? 0) + boost).toFixed(3));
}

function thinkTimmy(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  if (!m.init) {
    m.init = 1; m.excite = rng.float(0, 0.15); m.sugar = rng.float(0, 18); m.met = {}; m.lickT = G.time + rng.float(2, 6);
    n.ch = 0;
    if (pitAt(z, c.x, c.z) && rng.chance(0.75)) setMd(c, 'hide');
    else if (rng.chance(0.45)) { const pit = nearPit(c, z, 22); if (pit) { m.goPit = pit; } }
  }
  if (m.popped) { stop(c); return true; }
  m.mdT = (m.mdT ?? 0) + dt;
  m.sugar = Math.max(0, (m.sugar ?? 0) - dt);
  c.radius = c.sp.radius; c.height = c.sp.height;
  let md: string = n.md ?? '';
  // ---- hurt: it does not understand, and it does not like it
  if (ev.hurt > 0) {
    m.excite = 1; m.sugar = 0; fx(c, 'giggle');
    if (md === 'hide' || md === 'rise') setMd(c, '');
    startCharge(c, 0.14 + Math.min(0.3, ev.hurt / 50));
    md = 'charge';
  }
  // ---- given a sweet by hand
  if (poked(c, 'candy') && md !== 'eat' && !(md === 'charge' && (n.ch ?? 0) > 0.9)) { setMd(c, 'eat'); fx(c, 'eat'); m.candy = null; return true; }
  // ---- loud things nearby excite it
  if (c.lastHeard && G.time - c.lastHeard.t < 0.3 && c.lastHeard.r > 10 && md !== 'charge') m.excite = Math.min(1, (m.excite ?? 0) + 0.25);
  // ---- hidden in the balls with only its hat showing
  if (md === 'hide') {
    stop(c); c.setState('hide');
    for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < (p.running ? 5.5 : 3.6)) { setMd(c, 'rise'); fx(c, 'rise'); faceTo(c, p.x, p.z); m.tgt = p.id; break; } }
    if (m.mdT > 120 && rng.chance(dt * 0.02)) setMd(c, '');
    return true;
  }
  if (md === 'rise') { stop(c); c.setState('idle'); if (m.mdT > RISE_T) setMd(c, 'wave'); return true; }
  // ---- eating: sucks it, hums, the swelling sighs back down
  if (md === 'eat') {
    stop(c); c.setState('eat');
    n.ch = Math.max(0, +((n.ch ?? 0) - dt * 0.5).toFixed(3));
    if (m.mdT > EAT_T) { m.sugar = SUGAR_T + rng.float(0, 15); m.excite = 0; n.ch = 0; setMd(c, ''); fx(c, 'calm'); }
    return true;
  }
  const cand = candyNear(c, md === 'charge' ? 7 : 11);
  // ---- charging: swelling, squeaking, drifting at whoever is nearest to hug them
  if (md === 'charge') {
    c.setState('chase');
    if (cand && (n.ch ?? 0) < 0.9) { setMd(c, 'candy'); m.candy = cand; fx(c, 'calm'); return true; }
    let near: { p: Player; d: number } | null = null;
    for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < 18 && (!near || d < near.d)) near = { p, d }; }
    n.ch = Math.min(1, +((n.ch ?? 0) + (dt / CHARGE_T) * (near && near.d < 2.2 ? 1.5 : 1)).toFixed(3));
    if (near && near.d > 0.9) cs.moveTo(c, z, near.p.x, near.p.z, c.sp.walk * (1 + (n.ch ?? 0) * 1.1), dt, 0.7);
    else { stop(c); if (near) faceTo(c, near.p.x, near.p.z); }
    if ((m.sqT ?? 0) < G.time) { m.sqT = G.time + rng.float(0.9, 1.6) - (n.ch ?? 0) * 0.6; fx(c, 'squeal'); }
    if ((n.ch ?? 0) >= 1) explode(c, 1);
    return true;
  }
  // ---- candy: it goes for it, and nothing else matters
  if (md === 'candy' || (cand && (m.sugar <= 8 || md === 'beg'))) {
    const tg: Candy | null = cand ?? m.candy;
    if (!tg) { setMd(c, ''); return true; }
    if (md !== 'candy') { setMd(c, 'candy'); fx(c, 'giggle'); }
    m.candy = tg;
    n.ch = Math.max(0, +((n.ch ?? 0) - dt * 0.25).toFixed(3));
    c.setState('travel');
    const fz = zoneOf(c);
    if (Math.hypot(tg.x - c.x, tg.z - c.z) < 0.75 || cs.moveTo(c, fz, tg.x, tg.z, c.sp.run * 0.8, dt, 0.5)) {
      // still there? eat it
      const still = floorItemsAround(fz, tg.x, tg.z, 0.6).find((w) => w.item.uid === tg.uid);
      if (still) { op('a_takeFloor', { z: c.zoneKey, uid: tg.uid }); setMd(c, 'eat'); fx(c, 'eat'); faceTo(c, tg.x, tg.z); }
      else setMd(c, '');
      m.candy = null;
    }
    if (m.mdT > 20) { setMd(c, ''); m.candy = null; }
    return true;
  }
  // ---- it licks its own lollipop now and then: that keeps it level
  if (G.time > (m.lickT ?? 0)) { m.lickT = G.time + rng.float(4, 9); m.excite = Math.max(0, (m.excite ?? 0) - 0.04); if (md === '' || md === 'follow') fx(c, 'lick'); m.lickUntil = G.time + 1.8; }
  // ---- people
  let near: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < c.sp.sight && (!near || d < near.d)) near = { p, d }; }
  if (near) {
    const p = near.p, d = near.d;
    m.tgt = p.id;
    if (!m.met[p.id]) { m.met[p.id] = 1; setMd(c, 'wave'); fx(c, 'giggle'); faceTo(c, p.x, p.z); return true; }
    if (md === 'wave') { stop(c); faceTo(c, p.x, p.z); c.setState('curious'); if (m.mdT > WAVE_T) setMd(c, 'follow'); return true; }
    const sweet = holdsSweet(p);
    // excitement: too close for too long; chasing it (or being chased); calmed by sugar
    if (m.sugar > 0) m.excite = Math.max(0, m.excite - dt / 20);
    else if (sweet) m.excite = Math.max(0, m.excite - dt / 40);
    else if (d < 2.2) m.excite += dt / 9;
    else if (d < 4.5) m.excite += dt / 24;
    else m.excite = Math.max(0, m.excite - dt / 30);
    if (p.running && d < 7 && m.sugar <= 0) { m.excite += dt / 16; if ((m.chaseG ?? 0) < G.time) { m.chaseG = G.time + rng.float(2.5, 5); fx(c, 'giggle'); } }
    if (m.excite >= 1 && m.sugar <= 0) { startCharge(c, 0); return true; }
    // follow at a polite distance that gets less polite; beg if it can see a sweet in your hand
    const keep = sweet ? 1.2 : 3.2 - 1.8 * Math.min(1, m.excite);
    setMd(c, sweet ? 'beg' : m.lickUntil > G.time ? 'lick' : 'follow');
    c.setState('curious');
    if (d > keep + 0.5) cs.moveTo(c, z, p.x, p.z, d > 7 ? c.sp.run * 0.75 : c.sp.walk, dt, keep);
    else { stop(c); faceTo(c, p.x, p.z); }
    return true;
  }
  m.excite = Math.max(0, (m.excite ?? 0) - dt / 25);
  // ---- nobody about: drift, linger, go and hide in the balls
  if (md === 'follow' || md === 'beg' || md === 'wave') setMd(c, m.lickUntil > G.time ? 'lick' : '');
  else if (md === 'lick' && m.lickUntil <= G.time) setMd(c, '');
  if (m.goPit) {
    c.setState('travel');
    if (cs.moveTo(c, z, m.goPit.x, m.goPit.z, c.sp.walk, dt, 0.4) || m.mdT > 30) { m.goPit = null; if (pitAt(z, c.x, c.z)) setMd(c, 'hide'); }
    return true;
  }
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk * 0.8, dt, 0.6) || c.stateT > 25) {
    if (rng.chance(0.3)) { const pit = nearPit(c, z, 24); if (pit) { m.goPit = pit; c.goal = null; return true; } }
    c.goal = findSpot(c, { rMin: 3, rMax: 12 }) ?? cs.wanderSpot(c, z, 12);
    c.stateT = 0;
  }
  return true;
}

/** host: the pop. Everything within a few metres gets confetti, candy, blood and the blast. */
function explode(c: Creature, power: number) {
  const m = c.mem, n = net(c);
  if (m.popped) return;
  m.popped = 1; n.pp = 1; n.ch = 0;
  const cs = CS(), z = zoneOf(c), R = 1.4 + 2.4 * power;
  fx(c, 'pop', { p: Math.round(power * 100) / 100 });
  // people
  for (const p of playersNear(c, c.x, c.z, R)) {
    const d = dist(p, c), k = 1 - d / R;
    hitPlayer(c, p, Math.round((5 + 44 * k * k) * power), k > 0.55 ? ['burn', 'deep', 'bruise'] : ['bruise', 'burn'], 0.5 + 1.8 * k * power);
    bus.emit('bloodied', p, 'torso_u', 0.3 + 0.5 * k);
  }
  // other inhabitants (other Timmies go off too: they are excitable)
  for (const o of [...cs.creatures.values()]) {
    if (o === c || o.dead || o.zoneKey !== c.zoneKey) continue;
    const d = dist(o, c);
    if (o.sp.key === 'timmy' && d < 9) {
      const on = net(o); o.mem.excite = 1; o.mem.sugar = 0;
      if (on.md === 'hide' || on.md === 'rise' || on.md === 'eat' || on.md === 'candy') on.md = '';
      if (on.md === 'charge') on.ch = Math.min(1, (on.ch ?? 0) + 0.3 * (1 - d / 9) + 0.08); else { on.md = 'charge'; o.mem.mdT = 0; on.ch = 0.08 + 0.3 * (1 - d / 9); }
    }
    if (d < R) { const k = 1 - d / R; cs.damage(c.id, o.id, Math.round((6 + 46 * k * k) * power), c.x, c.z, 0.4 + 1.2 * k, 'blast'); }
  }
  // furniture near it
  const D = G.destruct as any;
  if (D?.damageObject && G.local?.zoneKey === c.zoneKey) {
    for (const o of z.objects.values()) {
      const ox = o.x + 0.5, oz = o.y + 0.5, d = Math.hypot(ox - c.x, oz - c.z);
      if (d > R * 0.75) continue;
      try { D.damageObject(null, o, Math.round((12 + 40 * (1 - d / R)) * power), 'blast', undefined, [ox - c.x || 0.01, oz - c.z]); } catch { /* not breakable */ }
    }
  }
  // the mess: confetti and candy on the floor, blood up the walls; a couple of sweets that were in its pockets
  for (let i = 0; i < Math.round(5 * power) + 2; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(0.2, R * 0.75);
    op('decal', { z: c.zoneKey, d: { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, w: rng.float(0.8, 1.6), d: rng.float(0.8, 1.6), rot: rng.float(0, 6.28), tex: i % 3 === 2 ? 'bx_candy_bits' : 'bx_confetti' } });
  }
  for (let i = 0; i < Math.round(3 * power) + 1; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(0.3, R * 0.6);
    op('decal', { z: c.zoneKey, d: { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, w: rng.float(0.6, 1.3), d: rng.float(0.6, 1.3), rot: rng.float(0, 6.28), tex: rng.chance(0.5) ? 'gore_red_splat_a' : 'gore_red_splat_b' } });
  }
  for (let i = 0; i < (power > 0.7 ? 2 : 1); i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(0.6, 2.2), x = c.x + Math.cos(a) * r, zz = c.z + Math.sin(a) * r;
    if (walkable(z, Math.floor(x), Math.floor(zz))) op('dropFloor', { z: c.zoneKey, item: serializeItem(createItem(i ? 'gumball' : 'lollipop')), x, zz, y: 1.2, v: [Math.cos(a) * 2, 2.5, Math.sin(a) * 2] });
  }
  // and it is gone
  if (!c.dead) {
    if (G.gore) G.gore.debugForce = 'hb';
    cs.kill(c, z, c.id, { dmg: Math.round(40 * power), kind: 'blast', fx: c.x, fz: c.z + 0.05 });
    if (G.gore) G.gore.debugForce = null;
  }
}

const TIMMY = def({
  key: 'timmy', name: 'Timmy', code: 'BH-01 // REMNANT, CHILD (PRESSURISED)', temperament: 'curious', threat: 4,
  rule: {
    name: 'IT POPS',
    text: 'It wants to play. Stay close to it too long, hurt it, or run and make a game of it, and it gulps air between giggles until its head swells, reddens, squeaks and pops, and everything near it goes with it. A swelling one drifts at you to hug you: back off, or kill it from a distance before it gets big. A sweet thrown near it (or given to it) calms it: it sucks, hums and forgets you for a while.',
    tell: 'A little kid. A little kid with a head like a beach ball. It is floating.',
  },
  hp: 30, walk: 0.95, run: 1.9, turn: 3, radius: 0.42, height: 1.95, sight: 14, fov: 2.2, hearing: 1.2,
  attack: { dmg: [1, 3], range: 0.8, cooldown: 3, kinds: ['bruise'], corrupt: 0, knock: 0.1 },
  zones: ['ballhouse', 'playground'], weight: 1, group: [1, 3], maxPerZone: 9, diet: 'none',
  sounds: { idle: 'tim_coo', alert: 'tim_giggle', hurt: 'tim_squeak', loop: 'tim_whir' },
  scan: {
    cls: 'Remnant / child, pressurised',
    notes: [
      'A child of five or six whose head has swollen into a thin balloon of skin. It floats; the body dangles under it.',
      'Propeller beanie, printed shirt, a lollipop it licks to stay calm. Every one of them answers to Timmy.',
      'Close for too long, hurt, or excited, it swells, reddens and pops. The blast hurts everything within a few metres.',
      'A sweet thrown near it calms it. Killed before it swells, it only goes down like a balloon.',
    ],
  },
  gore: { blood: 'red', flesh: 0xe0a090, sever: ['uarmL', 'uarmR', 'farmL', 'farmR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: () => buildTimmy(0), animate: animateTimmy, think: thinkTimmy,
});
(TIMMY as any).handlesSevered = true;

// killed before it popped: swelling enough, it goes off anyway; otherwise it goes down like a balloon
onKilled('timmy', (c) => {
  if (c.mem.popped) return;
  const n = net(c), ch = n.ch ?? 0;
  if (ch >= 0.45) {
    explode(c, 0.35 + ch * 0.65);
    const gore = G.gore as any;
    if (gore && !(c.mem.sev || []).includes('head')) {
      const ev = { t: 'c', id: c.id, w: 'blast', a: 30, x: Math.round(c.x * 10) / 10, z: Math.round((c.z + 0.05) * 10) / 10, k: 1, hb: 1 };
      try { gore.applyCreature(ev); gore.send(ev); } catch (e) { console.warn('timmy pop', e); }
    }
  } else { n.df = 1; n.ch = 0; fx(c, 'deflate'); }
});
// the menu: give it a sweet by hand
creatureMenu('timmy', (p, c, opts) => {
  const it = p.findItem?.((i: any) => isSweet(i.key));
  opts.push({
    label: 'Give it a sweet', disabled: it ? false : 'needs something sweet',
    action: () => { if (!it) return; p.removeItem(it); bus.emit('inventoryChanged', p); poke(p, c, 'candy'); bus.emit('think', p, 'It snatches it out of my hand with sticky fingers and stuffs it in its mouth.'); },
  });
});
onPlayerHit('timmy', (p) => {
  bus.emit('think', p, ['Confetti. There is confetti in the cuts.', 'It popped right next to me. My ears are ringing and I am covered in it.', 'Sweet. It smells like strawberry and blood.'][Math.floor(Math.random() * 3)]);
});

TIMMY.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const num = (k: string) => (u.get(k) !== null ? Number(u.get(k)) : undefined);
  const q = (u.get('pose') || ['idle', 'wave', 'lick', 'follow', 'charge', 'eat', 'beg'][Math.floor(t / 6) % 7]) as TimmyPose;
  poseTimmy(rig as KitRig, t, 1 / 60, q, { variant: num('v') ?? 0, ch: num('ch') });
};
horrify(TIMMY, { twitch: 0.25, snap: 0.15, breathe: 0, lunge: 0, flop: false, parts: /jaw|fing|thumb/ });
void cross; void mixHex;
