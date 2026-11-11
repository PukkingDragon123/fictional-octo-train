import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { worldMaterial } from '../../gfx/materials';
import { makeItemMesh } from '../../items/itemMeshes';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { HumanRig, SKIN_TONES, HAIR_COLORS, type Appearance, type Outfit } from '../../entities/humanRig';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, stop, faceTo, findSpot, onPlayerHit, floorItemsAround, takeFloorItem, dropStored, isPrecious, restoreStore, HeldAction } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, walkable, lightAt, beamOn, live, lineOfSightB } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, V3, Wt, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash, gauss } from '../kit/humanoids';
import { chain, sac, blade, paintSkin, paintCap } from '../kit/organic';
import { applyHitToPlayer, type HitInfo } from '../manager';
import { defDread } from '../dread';
import { TEARS } from '../../gore/tearing';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE WHIP RAT — a brown rat the size of a big dog, gone wrong in two places.
// Its eyes have left their sockets and ride the ends of two long, ringed
// muscular stalks that lash like whips: they sweep round corners ahead of it,
// track you independently, and crack out to strike and stun. Its tail is an
// arm: a scaly rat's tail for the first half, then a man's forearm, and at the
// end a hand, a human hand, too clean in the nails, that grips the floor and
// pulls the animal along, takes things, and closes on ankles. Mangy hide in
// patches over raw sinew and showing ribs, yellow incisors as long as fingers.
// It hunts in the dark: lurk, peek, stalk, ambush, eye-whip, tail-grab, drag.
// The forearm and hand are the game's one human base (a HumanRig: same mesh and skin
// painter as every unit), hung on the last tail joint (see attachHand).
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildWhipRat(variant?)                        -> KitRig (rig.root into any scene)
//   poseWhipRat(rig, t, dt, pose, { variant, speed, lookYaw, lookPitch, hold, item })
//     pose: 'idle' | 'walk' | 'run' | 'prowl' | 'stalk' | 'ambush' | 'peek' | 'whip' |
//           'grab' | 'drag' | 'haul' | 'feed' | 'recoil' | 'flee' | 'dead'
//   'whip' and 'grab' loop their strike every few seconds (or pass { strikeT } for a fixed moment).
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
/** eye-stalk segments and their length; tail-arm segments and theirs */
const NS = 7, SEG = 0.115;
const NT = 10, TSEG = 0.165;
/** the hand is a man's, from the game's one human base (HumanRig): its forearm runs from the last tail joint to the wrist */
const HAND_S = 1.05, FOREARM = 0.25 * HAND_S;
const TAIL_Y = 0.44, TAIL_Z = -0.6, HAND_Z = TAIL_Z - TSEG * (NT - 1) - FOREARM;

/** what is wrong with each one: which flank is torn open, which ear is bitten, coat colour */
interface RatVar { torn: number; ear: number; fur: number; skin: number; scale: number }
const VARS: RatVar[] = [
  { torn: 1, ear: -1, fur: 0x5a4a3c, skin: 0x8a6a64, scale: 1 },
  { torn: -1, ear: 1, fur: 0x4a4440, skin: 0x7a6260, scale: 1.12 },
  { torn: 1, ear: 1, fur: 0x6a5238, skin: 0x8e7066, scale: 0.92 },
];

// ------------------------------------------------------------------ skeleton (model space, facing +z)
function bonesR(): BoneSpec[] {
  const A: [string, string, V3, boolean?][] = [
    ['base', '', [0, 0, 0]],
    ['pelvis', 'base', [0, 0.47, -0.34], true],
    ['spine', 'pelvis', [0, 0.52, -0.08]],
    ['chest', 'spine', [0, 0.49, 0.16], true],
    ['neck', 'chest', [0, 0.47, 0.33], true],
    ['head', 'neck', [0, 0.46, 0.45], true],
    ['jaw', 'head', [0, 0.41, 0.5]],
    ['nose', 'head', [0, 0.425, 0.66]],
  ];
  for (const [s, k] of SIDES) A.push(['ear' + s, 'head', [k * 0.066, 0.515, 0.455], true]);
  // the eye stalks come out of the eye sockets; rest pose straight up
  for (const [s, k] of SIDES) {
    const r0: V3 = [k * 0.058, 0.478, 0.56];
    for (let i = 0; i < NS; i++) A.push(['es' + s + i, i ? 'es' + s + (i - 1) : 'head', [r0[0], r0[1] + SEG * i, r0[2]], i === 0]);
    A.push(['eye' + s, 'es' + s + (NS - 1), [r0[0], r0[1] + SEG * NS, r0[2]], true]);
  }
  // front legs: shoulder blade, elbow, wrist, paw (the elbow points back)
  for (const [s, k] of SIDES) {
    A.push(['scap' + s, 'chest', [k * 0.11, 0.45, 0.2], true], ['elbow' + s, 'scap' + s, [k * 0.11, 0.25, 0.12]], ['wrist' + s, 'elbow' + s, [k * 0.11, 0.075, 0.2]], ['fpaw' + s, 'wrist' + s, [k * 0.11, 0.022, 0.255]]);
  }
  // hind legs: hip, knee (forward), ankle (back, high), the long foot to the ball
  for (const [s, k] of SIDES) {
    A.push(['hip' + s, 'pelvis', [k * 0.125, 0.43, -0.32], true], ['knee' + s, 'hip' + s, [k * 0.125, 0.27, -0.16]], ['ankle' + s, 'knee' + s, [k * 0.125, 0.11, -0.38]], ['hpaw' + s, 'ankle' + s, [k * 0.125, 0.022, -0.24]]);
  }
  // the tail-arm: ten segments (rat tail into a man's forearm), the hand, four fingers and a thumb
  for (let i = 0; i < NT; i++) A.push(['t' + i, i ? 't' + (i - 1) : 'pelvis', [0, TAIL_Y, TAIL_Z - TSEG * i], i === 0 || i === 5]);
  A.push(['thand', 't' + (NT - 1), [0, TAIL_Y, HAND_Z]]);
  const abs = new Map<string, V3>();
  return A.map(([name, parent, p, cap]) => {
    abs.set(name, p);
    const q = parent ? abs.get(parent)! : [0, 0, 0];
    return { name, parent, at: [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cap };
  });
}

// ------------------------------------------------------------------ geometry
function layoutR(p: Page) {
  p.reg('HIDE', 64, 64); p.reg('HEAD', 48, 32); p.reg('LEG', 32, 32); p.reg('TAIL', 24, 48); p.reg('ARM', 32, 40);
  p.reg('STALK', 16, 48); p.reg('EYE', 16, 16); p.reg('SINEW', 16, 24); p.reg('EAR', 16, 16);
  p.reg('PAW', 16, 16); p.reg('TOOTH', 8, 8); p.reg('CLAW', 8, 8); p.reg('NOSE', 8, 8); p.reg('SOCKET', 8, 8);
  p.reg('BONE', 16, 8); p.reg('WHISK', 4, 8); p.reg('GUM', 8, 8); p.reg('CAP', 8, 8);
}

const BODY: [number, number, number, number][] = [
  // z, centre y, half width, half height
  [-0.66, 0.405, 0.04, 0.04], [-0.58, 0.425, 0.11, 0.1], [-0.48, 0.445, 0.165, 0.145], [-0.34, 0.465, 0.19, 0.165], [-0.2, 0.48, 0.185, 0.17],
  [-0.06, 0.485, 0.17, 0.165], [0.08, 0.475, 0.16, 0.16], [0.2, 0.462, 0.15, 0.155], [0.3, 0.452, 0.12, 0.125], [0.39, 0.452, 0.092, 0.098],
];
const SPINE: [string, number][] = [['pelvis', -0.34], ['spine', -0.08], ['chest', 0.16], ['neck', 0.36]];
/** body weights: the two nearest spine bones along z */
function spineW(x: BuildCtx, z: number): Wt {
  const c = SPINE.map(([n, bz]) => [x.bi(n), Math.exp(-((z - bz) ** 2) / (2 * 0.11 * 0.11))] as [number, number]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const tot = c[0][1] + c[1][1] || 1;
  return [c[0][0], c[0][1] / tot, c[1][0], c[1][1] / tot];
}

function buildR(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, rest = x.rest, V = VARS[x.variant];
  // ================= the body: hunched, ribs and spine through mangy hide, belly sagging
  const bp: V3[] = BODY.map(([z, y]) => [0, y, z]);
  sac(B, R('HIDE'), 1, bp, BODY.map(([, , rx, ry]) => [rx, ry] as [number, number]), BODY.map(([z]) => spineW(x, z)), {
    n: 16, start: true, end: false,
    bump: (a, t) => {
      const spine = 0.11 * gauss(a, 0, 0.22) * Math.pow(Math.abs(Math.sin(t * Math.PI * 13)), 2) * (t > 0.1 ? 1 : 0);
      const ribs = (t > 0.48 && t < 0.86 && Math.abs(a) > 1.0 && Math.abs(a) < 2.3 ? 0.045 * Math.max(0, Math.sin(t * Math.PI * 34)) : 0) * (Math.sign(a) === -V.torn ? 1.6 : 1);
      const belly = Math.abs(a) > 2.3 ? 0.09 * Math.sin(Math.PI * t) : 0;
      const blades = 0.12 * gauss(t, 0.78, 0.07) * gauss(Math.abs(a), 0.9, 0.3) + 0.14 * gauss(t, 0.24, 0.08) * gauss(Math.abs(a), 1.2, 0.35);
      const mange = (hash(Math.round(a * 3), Math.round(t * 18) + x.variant * 7) - 0.5) * 0.07;
      return spine + ribs + belly + blades + mange;
    },
  });
  // ================= exposed sinew: strands bridging the torn flank, raw cords over the shoulder and hip
  const tk = V.torn;
  const strand = (a: V3, b: V3, wa: Wt, wb: Wt, r: number, g: number, sag = 0.01) => {
    const m: V3 = [(a[0] + b[0]) / 2 + tk * 0.004, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2];
    sac(B, R('SINEW'), g, [a, m, b], [[r, r * 0.8], [r * 0.75, r * 0.6], [r, r * 0.8]], [wa, [...wa.slice(0, 2).map((v, i) => (i === 1 ? v * 0.5 : v)), ...wb.slice(0, 2).map((v, i) => (i === 1 ? v * 0.5 : v))], wb], { n: 6 });
  };
  for (let i = 0; i < 4; i++) {
    const z0 = -0.02 + i * 0.07;
    strand([-tk * 0.168, 0.53 - i * 0.012, z0], [-tk * 0.172, 0.36 + i * 0.01, z0 + 0.05], spineW(x, z0), spineW(x, z0 + 0.05), 0.009 - i * 0.001, 2 + i, 0.006);
  }
  // the open flank: bare ribs (bone) lying in the wet muscle
  for (let i = 0; i < 4; i++) {
    const z = 0.02 + i * 0.055, ww = spineW(x, z);
    const pts: V3[] = [[-tk * 0.13, 0.6, z], [-tk * 0.178, 0.52, z + 0.012], [-tk * 0.19, 0.44, z + 0.02], [-tk * 0.17, 0.36, z + 0.024]];
    sac(B, R('BONE'), 6 + i, pts, pts.map((_, j) => [0.0085 - j * 0.0008, 0.0095 - j * 0.0008] as [number, number]), pts.map(() => ww), { n: 5 });
  }
  // cords over the shoulder blade into the neck, and across the hip
  for (const [s, k] of SIDES) {
    const sc = rest('scap' + s), nk = rest('neck');
    strand([k * 0.12, sc[1] + 0.05, sc[2] + 0.02], [k * 0.05, nk[1] + 0.06, nk[2] + 0.02], [bi('scap' + s), 1], [bi('neck'), 1], 0.011, 12 + (k > 0 ? 0 : 1), -0.03);
  }
  { const hp = rest('hip' + (tk > 0 ? 'R' : 'L')), sp = rest('spine');
    strand([-tk * 0.14, hp[1] + 0.09, hp[2] - 0.04], [-tk * 0.1, sp[1] + 0.05, sp[2]], [bi('hip' + (tk > 0 ? 'R' : 'L')), 1], [bi('spine'), 1], 0.012, 14, -0.02); }

  // ================= the neck and head: long rat skull, empty sockets, the stalks coming out of them
  const NK = rest('neck');
  sac(B, R('HIDE'), 20, [[0, NK[1] - 0.01, NK[2] - 0.06], [0, NK[1], NK[2]], [0, NK[1] + 0.002, NK[2] + 0.07]], [[0.1, 0.105], [0.088, 0.092], [0.08, 0.085]],
    [spineW(x, NK[2] - 0.06), [bi('neck'), 1], [bi('neck'), 0.5, bi('head'), 0.5]], { n: 14, start: false, end: false, bump: (a, t) => (hash(Math.round(a * 3), Math.round(t * 6) + 11) - 0.5) * 0.12 });
  const HZ: [number, number, number, number][] = [[0.37, 0.457, 0.084, 0.085], [0.42, 0.462, 0.094, 0.09], [0.48, 0.458, 0.09, 0.086], [0.54, 0.444, 0.076, 0.07], [0.6, 0.43, 0.058, 0.052], [0.65, 0.42, 0.042, 0.037], [0.69, 0.414, 0.027, 0.025], [0.715, 0.414, 0.012, 0.012]];
  const hw: Wt = [bi('head'), 1];
  sac(B, R('HEAD'), 21, HZ.map(([z, y]) => [0, y, z]), HZ.map(([, , rx, ry]) => [rx, ry] as [number, number]), HZ.map((_, i) => (i === 0 ? [bi('neck'), 0.4, bi('head'), 0.6] : hw)), {
    n: 16,
    // the emptied sockets (pits where the stalks come out), a heavy brow, cheek pouches, a bitten notch on top
    bump: (a, t) => -0.32 * gauss(t, 0.5, 0.06) * gauss(Math.abs(a), 1.05, 0.22) + 0.1 * gauss(t, 0.4, 0.07) * gauss(Math.abs(a), 0.6, 0.3)
      + 0.1 * gauss(t, 0.3, 0.12) * gauss(Math.abs(a), 1.9, 0.35) - 0.12 * gauss(t, 0.2, 0.06) * gauss(a, 0.3 * V.ear, 0.2) + (hash(Math.round(a * 4), Math.round(t * 10) + 3) - 0.5) * 0.05,
  });
  // wet red rims round the sockets, the stalk roots sunk in them
  for (const [s, k] of SIDES) {
    const r0 = rest('es' + s + '0'), sw: Wt = [bi('head'), 1];
    sac(B, R('SOCKET'), 22, [[r0[0] - k * 0.01, r0[1] - 0.012, r0[2]], [r0[0], r0[1] + 0.004, r0[2]], [r0[0] + k * 0.004, r0[1] + 0.016, r0[2]]], [[0.022, 0.026], [0.034, 0.036], [0.026, 0.028]], [sw, sw, sw], { n: 9, bump: (aa) => Math.sin(aa * 5) * 0.12 });
  }
  // lower jaw, gum line and the four incisors (two long upper, two lower), yellow-orange
  const J = rest('jaw'), jw: Wt = [bi('jaw'), 1];
  sac(B, R('HEAD'), 23, [[0, J[1] + 0.01, J[2] - 0.08], [0, J[1] - 0.006, J[2] - 0.02], [0, J[1] - 0.008, J[2] + 0.06], [0, J[1] - 0.004, J[2] + 0.14], [0, J[1], J[2] + 0.175]],
    [[0.055, 0.03], [0.052, 0.028], [0.04, 0.024], [0.025, 0.017], [0.012, 0.01]], [jw, jw, jw, jw, jw], { n: 10 });
  sac(B, R('GUM'), 24, [[0, J[1] + 0.012, J[2] + 0.06], [0, J[1] + 0.014, J[2] + 0.14], [0, J[1] + 0.01, J[2] + 0.17]], [[0.03, 0.008], [0.02, 0.008], [0.01, 0.006]], [jw, jw, jw], { n: 8 });
  for (const k of [1, -1]) {
    sac(B, R('TOOTH'), 25, [[k * 0.0075, 0.405, 0.7], [k * 0.0078, 0.378, 0.712], [k * 0.007, 0.35, 0.706], [k * 0.006, 0.33, 0.69]], [[0.0068, 0.005], [0.0066, 0.0048], [0.0058, 0.0042], [0.0016, 0.0012]], [hw, hw, hw, hw], { n: 6 });
    sac(B, R('TOOTH'), 26, [[k * 0.0065, J[1] + 0.004, J[2] + 0.168], [k * 0.007, J[1] + 0.024, J[2] + 0.185], [k * 0.006, J[1] + 0.04, J[2] + 0.19]], [[0.0058, 0.0045], [0.0052, 0.004], [0.0014, 0.0012]], [jw, jw, jw], { n: 6 });
  }
  // the nose and whiskers (on the nose bone, so they twitch with the sniffing)
  const NO = rest('nose'), nw: Wt = [bi('nose'), 1];
  sac(B, R('NOSE'), 27, [[0, NO[1] - 0.008, 0.69], [0, NO[1] - 0.008, 0.712], [0, NO[1] - 0.01, 0.728]], [[0.022, 0.018], [0.02, 0.016], [0.008, 0.007]], [nw, nw, nw], { n: 8 });
  for (const [, k] of SIDES) for (let i = 0; i < 5; i++) {
    const a0: V3 = [k * 0.03, 0.415 + (i - 2) * 0.006, 0.665 - i * 0.004];
    const out = 0.12 + i * 0.012, up = (i - 2) * 0.025;
    const pts: V3[] = [a0, [a0[0] + k * out * 0.5, a0[1] + up * 0.5, a0[2] + 0.02 - i * 0.008], [a0[0] + k * out, a0[1] + up - 0.02, a0[2] - 0.01 - i * 0.02]];
    blade(B, R('WHISK'), pts, [0.0025, 0.0018, 0.0008], [0, 1, 0], [nw, nw, nw], { offset: -0.5 });
  }
  // ears: round, thin, veined; one bitten through
  for (const [s, k] of SIDES) {
    const e = rest('ear' + s), ew: Wt = [bi('ear' + s), 1];
    const bit = k === V.ear ? 0.6 : 1;
    sac(B, R('EAR'), 28, [[e[0] - k * 0.004, e[1] - 0.01, e[2]], [e[0] + k * 0.012, e[1] + 0.025, e[2] - 0.006], [e[0] + k * 0.022, e[1] + 0.055 * bit, e[2] - 0.012]], [[0.022, 0.007], [0.042, 0.006], [0.026 * bit, 0.004]], [ew, ew, ew],
      { n: 10, up: [0, 0, 1], bump: (aa, t) => (k === V.ear && t > 0.5 && aa > 0.5 && aa < 1.6 ? -0.5 : 0) });
  }

  // ================= the eye stalks: ringed muscle, thick at the socket, a wet eye on the end
  for (const [s, k] of SIDES) {
    const bones = Array.from({ length: NS }, (_, i) => 'es' + s + i);
    const E = rest('eye' + s);
    chain(B, x, R('STALK'), 30 + (k > 0 ? 0 : 1), { bones, tip: E, r: (t) => 0.029 * (1 - t * 0.5) + 0.007 * gauss(t, 0.94, 0.04), n: 7, rings: 3, knuckle: 0.08,
      bump: (aa, t) => 0.13 * Math.pow(Math.max(0, Math.sin(t * Math.PI * NS * 3)), 3) + 0.05 * Math.sin(aa * 2 + t * 30) * (1 - t), start: false, end: false });
    // the eyeball, looking out along the stalk; a fleshy lid hood behind it
    const ew: Wt = [bi('eye' + s), 1];
    sac(B, R('EYE'), 32 + (k > 0 ? 0 : 1), [[E[0], E[1] - 0.034, E[2]], [E[0], E[1] - 0.022, E[2]], [E[0], E[1], E[2]], [E[0], E[1] + 0.022, E[2]], [E[0], E[1] + 0.034, E[2]]],
      [[0.012, 0.012], [0.027, 0.027], [0.034, 0.034], [0.027, 0.027], [0.011, 0.011]], [ew, ew, ew, ew, ew], { n: 10 });
    sac(B, R('STALK'), 34 + (k > 0 ? 0 : 1), [[E[0], E[1] - 0.05, E[2]], [E[0], E[1] - 0.022, E[2]], [E[0], E[1] - 0.004, E[2] - 0.004]], [[0.018, 0.018], [0.038, 0.036], [0.036, 0.032]], [[bi('es' + s + (NS - 1)), 1], ew, ew],
      { n: 9, start: false, end: false, bump: (aa) => (Math.abs(aa) < 1.2 ? -0.35 : 0) });
  }

  // ================= front legs: thin, half-bald, long-fingered paws
  for (const [s, k] of SIDES) {
    const fp = rest('fpaw' + s);
    chain(B, x, R('LEG'), 40 + (k > 0 ? 0 : 1), { bones: ['scap' + s, 'elbow' + s, 'wrist' + s, 'fpaw' + s], tip: [fp[0], 0.02, fp[2] + 0.045], r: (t) => (t < 0.3 ? 0.075 - t * 0.12 : 0.04 - t * 0.024), n: 8, rings: 3, knuckle: 0.25,
      bump: (aa, t) => (hash(Math.round(aa * 3), Math.round(t * 12) + k) - 0.5) * 0.16 });
    const pw: Wt = [bi('fpaw' + s), 1];
    for (let f = 0; f < 4; f++) {
      const sx = (f - 1.5) * 0.013, root: V3 = [fp[0] + sx, 0.02, fp[2] + 0.03], tip: V3 = [fp[0] + sx * 1.8, 0.008, fp[2] + 0.075 - Math.abs(f - 1.5) * 0.008];
      sac(B, R('PAW'), 42, [root, [(root[0] + tip[0]) / 2, 0.016, (root[2] + tip[2]) / 2], tip], [[0.008, 0.007], [0.006, 0.005], [0.004, 0.0035]], [pw, pw, pw], { n: 5 });
      sac(B, R('CLAW'), 43, [tip, [tip[0] + sx * 0.3, 0.006, tip[2] + 0.014], [tip[0] + sx * 0.4, 0.0, tip[2] + 0.02]], [[0.0035, 0.003], [0.0025, 0.002], [0.0006, 0.0006]], [pw, pw, pw], { n: 4 });
    }
  }
  // ================= hind legs: heavy haunch, long naked foot, five clawed toes
  for (const [s, k] of SIDES) {
    const hp = rest('hpaw' + s), an = rest('ankle' + s);
    chain(B, x, R('LEG'), 46 + (k > 0 ? 0 : 1), { bones: ['hip' + s, 'knee' + s, 'ankle' + s], tip: [hp[0], 0.03, hp[2]], r: (t) => (t < 0.4 ? 0.11 - t * 0.14 : 0.05 - t * 0.032), n: 8, rings: 3, knuckle: 0.18,
      bump: (aa, t) => (hash(Math.round(aa * 3), Math.round(t * 12) + 5 + k) - 0.5) * 0.16 });
    const fw: Wt = [bi('ankle' + s), 1], bw: Wt = [bi('hpaw' + s), 1];
    sac(B, R('PAW'), 48, [[an[0], an[1] - 0.04, an[2] - 0.02], [an[0], 0.035, an[2] + 0.04], [hp[0], 0.025, hp[2]], [hp[0], 0.02, hp[2] + 0.05]], [[0.022, 0.02], [0.024, 0.016], [0.03, 0.014], [0.03, 0.012]], [fw, fw, bw, bw], { n: 8 });
    for (let f = 0; f < 5; f++) {
      const sx = (f - 2) * 0.012, root: V3 = [hp[0] + sx, 0.02, hp[2] + 0.05], tip: V3 = [hp[0] + sx * 1.9, 0.01, hp[2] + 0.1 - Math.abs(f - 2) * 0.012];
      sac(B, R('PAW'), 49, [root, tip], [[0.008, 0.007], [0.004, 0.0035]], [bw, bw], { n: 5 });
      sac(B, R('CLAW'), 50, [tip, [tip[0] + sx * 0.3, 0.004, tip[2] + 0.018]], [[0.0035, 0.003], [0.0006, 0.0006]], [bw, bw], { n: 4 });
    }
  }

  // ================= the tail-arm: scaly rat tail, a ragged seam, then a man's forearm and hand
  const tails = Array.from({ length: NT }, (_, i) => 't' + i);
  chain(B, x, R('TAIL'), 60, { bones: tails.slice(0, 6), tip: rest('t6'), r: (t) => 0.06 - t * 0.032, n: 8, rings: 3, knuckle: 0.04, start: true, end: false,
    bump: (aa, t) => 0.05 * Math.max(0, Math.sin(t * Math.PI * 40)) });
  // the seam where the scales give way to skin: puckered, stitched by nothing
  { const p = rest('t5'), w5: Wt = [bi('t5'), 1];
    sac(B, R('SINEW'), 61, [[0, p[1], p[2] + 0.025], [0, p[1], p[2]], [0, p[1], p[2] - 0.03]], [[0.032, 0.032], [0.038, 0.037], [0.03, 0.03]], [[bi('t4'), 0.5, bi('t5'), 0.5], w5, w5],
      { n: 10, start: false, end: false, bump: (aa) => (hash(Math.round(aa * 4), 7) - 0.5) * 0.4 }); }
  // the upper arm: skin over a swelling of muscle, one extra elbow knuckle where no elbow should be; it ends at the
  // man's elbow, where the human forearm and hand (the shared HumanRig, see decorate) take over
  const t9 = rest('t' + (NT - 1));
  chain(B, x, R('ARM'), 62, { bones: tails.slice(5, NT - 1), tip: [0, TAIL_Y, t9[2] - 0.035], n: 9, rings: 3, knuckle: 0.06, start: false, end: true,
    r: (t) => 0.03 + 0.014 * Math.sin(Math.min(1, t * 1.3) * Math.PI) + 0.012 * gauss(t, 0.3, 0.05),
    bump: (aa, t) => 0.06 * gauss(aa, 0.3, 0.5) * gauss(t, 0.5, 0.2) + (Math.abs(aa) > 2.4 ? -0.05 : 0) });
}

// ------------------------------------------------------------------ painting
function paintR(p: Page, x: BuildCtx) {
  const v = x.variant, V = VARS[v];
  const FUR = makeRamp(V.fur, 7, { hueShift: 0.03, spread: 0.5 }), SK = makeRamp(V.skin, 6, { hueShift: 0.04, spread: 0.55 });
  const RAW = makeRamp(0x8a2420, 7, { hueShift: 0.05, spread: 0.65 });
  const hide = p.R('HIDE');
  // fur: wiry, clumped, greasy; pale underneath; bald mange patches of grey-pink scabbed skin
  hide.fill(FUR, (xx, yy) => {
    const th = (hide.deg(xx) * Math.PI) / 180;
    const strand = ((yy + Math.floor(hash(xx >> 1, 3 + v) * 6)) % 6) / 6;
    return 2.9 + Math.cos(th) * 0.9 + (hide.fbm(xx, yy, 4, 2, 5 + v) - 0.5) * 1.6 + strand * 0.7 - 0.3 + (Math.abs(th) > 2.3 ? 1.4 : 0);
  }, undefined, 0.55);
  for (let i = 0; i < 9; i++) {
    const cx = hash(i, 13 + v) * hide.w, cy = hide.h * (0.15 + hash(i, 14 + v) * 0.75), rx = 2.5 + hash(i, 15) * 4, ry = 2 + hash(i, 16) * 4;
    for (let yy = Math.floor(cy - ry - 1); yy <= cy + ry + 1; yy++) for (let xx = Math.floor(cx - rx - 1); xx <= cx + rx + 1; xx++) {
      const d = Math.hypot((xx - cx) / rx, (yy - cy) / ry) + (hash(xx, yy + i) - 0.5) * 0.35;
      if (d < 1) hide.put(xx, yy, SK, 2.4 + (hash(xx * 3, yy) - 0.5) * 1.4 - d * 0.8, 0.5);
      if (d < 0.35 && hash(xx, yy * 7 + i) < 0.4) hide.set(xx, yy, 0x5a1810);
    }
  }
  // the torn flank: hide peeled back off red, striated muscle (the ribs and cords sit on top of this)
  const fu = V.torn > 0 ? 0.75 : 0.25;
  for (let yy = 0; yy < hide.h; yy++) for (let xx = 0; xx < hide.w; xx++) {
    const u = (xx + 0.5) / hide.w, t = 1 - (yy + 0.5) / hide.h;
    const d = Math.hypot((u - fu) / 0.1, (t - 0.67) / 0.15) + (hide.fbm(xx, yy, 3, 2, 9) - 0.5) * 0.6;
    if (d < 1) hide.put(xx, yy, RAW, 3 + Math.sin(yy * 1.7 + xx * 0.3) * 1.1 - d * 1.2 + (hash(xx, yy) - 0.5) * 0.6, 0.5);
    else if (d < 1.18) hide.put(xx, yy, SK, 1.2 + (hash(xx, yy) - 0.5), 0.5);
  }
  // spine knuckles showing through the bald back
  for (let yy = 4; yy < hide.h - 3; yy += 3) { hide.blend(hide.w / 2, yy, 0xc8b8a0, 0.55); hide.blend(hide.w / 2 - 1, yy, 0x3a2420, 0.35); }
  for (let i = 0; i < 14; i++) hide.blend(hash(i, 40 + v) * hide.w, hash(i, 41 + v) * hide.h, 0xf0e0d0, 0.5);
  // head: darker fur, bald pink snout, sore red skin round the sockets
  const hd = p.R('HEAD');
  hd.fill(FUR, (xx, yy) => 2.6 + Math.cos((hd.deg(xx) * Math.PI) / 180) * 0.9 + (hd.fbm(xx, yy, 3, 2, 7 + v) - 0.5) * 1.5 - (yy / hd.h) * 0.4, undefined, 0.55);
  for (let yy = 0; yy < hd.h; yy++) for (let xx = 0; xx < hd.w; xx++) {
    const f = yy / hd.h, th = (hd.deg(xx) * Math.PI) / 180;
    if (f > 0.68 + hash(xx, 9) * 0.1) hd.put(xx, yy, SK, 3 + Math.cos(th) + (hash(xx, yy) - 0.5) * 0.6, 0.5);
    if (f > 0.4 && f < 0.6 && Math.abs(Math.abs(th) - 1.05) < 0.4) hd.put(xx, yy, RAW, 3.5 - Math.abs(Math.abs(th) - 1.05) * 4, 0.5);
    if (Math.abs(Math.abs(th) - Math.PI) < 0.45 && f > 0.55) hd.blend(xx, yy, 0x2a1014, 0.75);
  }
  paintSkin(p.R('EAR'), makeRamp(0xc89088, 6, { spread: 0.5 }), { seed: 4 + v, veins: 7, vein: 0x8a3a3a, glint: 3 });
  // legs: fur at the top running out to bald, scaly skin at the paws
  const lg = p.R('LEG');
  lg.fill(FUR, (xx, yy) => 2.6 + Math.cos((lg.deg(xx) * Math.PI) / 180) * 0.9 + (lg.fbm(xx, yy, 3, 2, 3 + v) - 0.5) * 1.4, undefined, 0.55);
  for (let yy = 0; yy < lg.h; yy++) for (let xx = 0; xx < lg.w; xx++) if (yy / lg.h > 0.55 + hash(xx, 5) * 0.15 || hash(xx >> 2, (yy >> 2) + v) < 0.12) lg.put(xx, yy, SK, 2.4 + Math.cos((lg.deg(xx) * Math.PI) / 180) + (((xx + yy) & 1) ? -0.4 : 0.2), 0.5);
  paintSkin(p.R('PAW'), makeRamp(0xc8968a, 6, { spread: 0.5 }), { seed: 6, veins: 3, vein: 0x8a5a54, glint: 3 });
  // the tail: scaly rings, grey-pink, dirty
  const tl = p.R('TAIL');
  const TL = makeRamp(0xa08880, 6, { spread: 0.55 });
  tl.fill(TL, (xx, yy) => 2.6 + Math.cos((tl.deg(xx) * Math.PI) / 180) * 1.1 + ((yy % 3) === 0 ? -1.1 : 0) + (((xx + (Math.floor(yy / 3) & 1) * 2) % 4) === 0 ? -0.6 : 0.2) + (tl.fbm(xx, yy, 2, 2, 2) - 0.5));
  for (let i = 0; i < 20; i++) tl.blend(hash(i, 3) * tl.w, hash(i, 4) * tl.h, 0x3a2a20, 0.4);
  // the forearm: a man's skin, pale and blotched, dark hairs, a blue vein, grime toward the hand
  const SKH = makeRamp(0xd8a890, 7, { hueShift: 0.04, spread: 0.55 });
  const ar = p.R('ARM');
  paintSkin(ar, SKH, { seed: 12 + v, veins: 5, vein: 0x7a7aa0, mottle: 1.2, spots: 4, spot: 0xb87868, glint: 5 });
  for (let i = 0; i < 70; i++) { const hx = hash(i, 21) * ar.w, hy = hash(i, 22) * ar.h; if (Math.abs(ar.deg(hx)) < 120) ar.line(hx, hy, hx + 1, hy + 1.5, 0x3a2418, 0.55); }
  for (let yy = 0; yy < ar.h; yy++) for (let xx = 0; xx < ar.w; xx++) if (yy / ar.h > 0.82 && hash(xx, yy) < 0.35) ar.blend(xx, yy, 0x5a4030, 0.35);
  // the first rows of the arm: still a little scaly (where it grew out of the tail)
  for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < ar.w; xx++) if (hash(xx, yy + 50) < 0.5 - yy * 0.1) ar.put(xx, yy, TL, 2 + (yy % 2), 0.5);
  // the stalks: wet ringed muscle, purple-red, veined, paler at the rings
  const st = p.R('STALK');
  const ST = makeRamp(0xa83a48, 7, { hueShift: 0.05, spread: 0.6 });
  st.fill(ST, (xx, yy) => 3 + Math.cos((st.deg(xx) * Math.PI) / 180) * 1.3 + ((yy % 4) === 0 ? 1.3 : (yy % 4) === 2 ? -0.5 : 0) + (st.fbm(xx, yy, 2, 2, 4) - 0.5) * 0.9);
  for (let i = 0; i < 5; i++) st.crack(hash(i, 3) * st.w, hash(i, 4) * st.h, 12, 90, 0x4a1020, i + 3, 0.6, 0.2);
  for (let i = 0; i < 16; i++) st.blend(hash(i, 8) * st.w, hash(i, 9) * st.h, 0xffd8d8, 0.7);
  // the eyes: a bloodshot white, an amber iris, a wide black pupil (the pupil is at the free end of the stalk)
  const ey = p.R('EYE');
  for (let yy = 0; yy < ey.h; yy++) for (let xx = 0; xx < ey.w; xx++) {
    const f = yy / ey.h;
    let c = f > 0.86 ? 0x080404 : f > 0.68 ? (hash(xx, yy) < 0.3 ? 0x8a5a10 : 0xc8901a) : f > 0.62 ? 0x4a2a0a : 0xe8dcc8;
    if (f < 0.62 && hash(xx * 3, yy * 5) < 0.12) c = 0xb82a2a;
    if (f < 0.25) c = mixHex(c, 0x9a3040, 0.5);
    ey.set(xx, yy, c);
  }
  ey.set(3, Math.floor(ey.h * 0.9), 0xffffff); ey.set(4, Math.floor(ey.h * 0.9), 0xffffff);
  const sk = p.R('SOCKET');
  sk.fill(RAW, (xx, yy) => 2 + (hash(xx, yy) - 0.5) * 2); sk.set(3, 3, 0xffd0d0);
  const sn = p.R('SINEW');
  sn.fill(RAW, (xx, yy) => 3.2 + Math.cos((sn.deg(xx) * Math.PI) / 180) * 1.4 + ((xx % 3) === 0 ? -1 : 0.3) + (hash(xx, yy) - 0.5) * 0.5);
  for (let yy = 0; yy < sn.h; yy += 5) for (let xx = 0; xx < sn.w; xx++) sn.blend(xx, yy, 0xe8d8c8, 0.55);
  p.R('BONE').fill(makeRamp(0xe0d4b8, 5, { spread: 0.45 }), (xx, yy) => 2.8 + Math.cos((p.R('BONE').deg(xx) * Math.PI) / 180) * 0.9 - (hash(xx, yy) < 0.1 ? 1.2 : 0));
  p.R('TOOTH').fill(makeRamp(0xd8a038, 5, { spread: 0.5 }), (xx, yy) => 2.6 - yy * 0.12 + (xx === 2 ? 1 : 0) + (hash(xx, yy) - 0.5) * 0.5);
  p.R('CLAW').fill(makeRamp(0x3a3028, 4), (xx, yy) => 1.4 + (xx === 3 ? 1.4 : 0) - yy * 0.1);
  p.R('NOSE').fill(makeRamp(0xc87070, 5, { spread: 0.5 }), (xx, yy) => 2.6 + (hash(xx, yy) - 0.5) - (yy > 5 ? 1 : 0));
  p.R('GUM').fill(makeRamp(0x9a3040, 4), (xx, yy) => 2 + (hash(xx, yy) - 0.5));
  p.R('WHISK').fill(makeRamp(0x2a2420, 3), () => 1);
  paintCap(p.R('CAP'), V.fur, 0xa82a28, 0x5a1010);
}

const RAT_KIT: KitDef = { key: 'whip_rat', variants: 3, W: 256, H: 256, bones: bonesR, layout: layoutR, build: buildR, paint: paintR, sphere: [0, 0.5, -0.4, 1.9],
  decorate: (rig) => {
    // eye-shine: a hot amber point on each eye that shows in the dark (the manager keeps rig.eyes drawn)
    const mat = worldMaterial({ unlit: true, outline: 0 } as any);
    const mb = new ModelBuilder(); mb.sphere(0, 0, 0, 0.016, 6, 4, 'white', { emissive: 1.6, color: 0xffb040 });
    const geo = mb.build();
    rig.eyes = (['eyeL', 'eyeR'] as const).map((n) => {
      const m = new THREE.Mesh(geo, mat); m.name = 'rat_shine'; m.position.set(0, 0.03, 0); m.castShadow = false;
      rig.parts[n].add(m); return m;
    });
    attachHand(rig);
  } };

// ------------------------------------------------------------------ the hand: the shared human base (HumanRig)
// Every human hand in the game is the same body. This one is a man's right forearm and hand from a HumanRig,
// hung on the last joint of the tail: the rest of that body is folded away to nothing inside the tail (its
// root bone collapsed to a point at the elbow), the forearm bone re-parented to the rig's body and turned so
// the fingers run on down the tail and the back of the hand is up. Same mesh, same skin painter as a unit.
const HAND_APP: Appearance = { skin: SKIN_TONES[1], hair: HAIR_COLORS[1], hairStyle: 'short', face: 1, build: 'average', height: HAND_S, bodyShape: 0.08, facialHair: 'none', age: 0.5, scars: 0, freckles: 0 };
const HAND_OUTFIT: Outfit = { torso: { tex: 'c_bare', color: SKIN_TONES[1] }, cond: { dirt: 2, pale: 1, blood: { hand_r: 1, farm_r: 1 } } };
/** HumanRig axes -> tail-bone axes: fingers (-y) run on down the tail (-z), the back of the hand (-x) faces up (+y) */
const HAND_BASIS = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
/** each HumanRig owns a texture page: rigs dropped by the manager (out of view, left the zone) give theirs back */
const HAND_POOL: HumanRig[] = [];
function inScene(o: THREE.Object3D) { while (o.parent) o = o.parent; return !!(o as any).isScene; }
function attachHand(rig: KitRig) {
  const free = HAND_POOL.find((h) => !inScene(h.root));
  if (free) { free.root.removeFromParent(); rig.parts['t' + (NT - 1)].add(free.root); rig.kit.m.hr = free; return; }
  const hr = new HumanRig(HAND_APP, worldMaterial({}));
  HAND_POOL.push(hr);
  hr.setOutfit(HAND_OUTFIT);
  hr.faceAnim = false;
  hr.skin.frustumCulled = false;
  (hr.skin as any).clone = () => new THREE.Group();
  // everything but the forearm collapses to a point at the elbow (inside the tail)
  const hips = hr.bones.hips;
  hips.matrixAutoUpdate = false; hips.matrix.makeScale(1e-4, 1e-4, 1e-4);
  const fa = hr.bones.farmR;
  hr.body.add(fa);
  fa.matrixAutoUpdate = false; fa.matrix.copy(HAND_BASIS);
  rig.parts['t' + (NT - 1)].add(hr.root);
  rig.kit.m.hr = hr;
}
/** wrist flex (about the tail's x) and grip 0..1 on the HumanRig hand */
function poseHand(K: KitRig, flex: number, grip: number, open: number) {
  const hr = K.kit.m.hr as HumanRig | undefined;
  if (!hr) return;
  // a rotation about the tail's x axis is one about the hand's -z
  hr.bones.handR.rotation.set(0, 0, -flex);
  const g = Math.max(-0.25, Math.min(1, grip - open * 0.25));
  hr.bones.fing1R.rotation.set(0, 0, g * 1.45);
  hr.bones.fing2R.rotation.set(0, 0, g * 1.6);
  hr.bones.thumbR.rotation.set(g * 0.5, -g * 0.6, g * 0.55);
}

/** a whip rat rig (variant 0..2) */
export function buildWhipRat(variant = 0): KitRig { return buildKitRig(RAT_KIT, variant, 0.55); }

// =====================================================================================
// motion helpers shared with the Strider (src/creatures/species/strider.ts)
// =====================================================================================
/** model-space (rig.root local) position of a bone joint as currently posed (update = refresh the matrices first) */
export function jointPos(K: KitRig, name: string, out = new THREE.Vector3(), update = true): THREE.Vector3 {
  if (update) K.root.updateMatrixWorld(true);
  K.parts[name].getWorldPosition(out);
  return K.root.worldToLocal(out);
}
/** a segment's angle in its sagittal plane: from straight down, positive toward +z */
const segAng = (a: V3, b: V3) => Math.atan2(b[2] - a[2], -(b[1] - a[1]));
export interface LegChain { names: [string, string, string]; rest: [V3, V3, V3, V3] }
/**
 * Planar three-segment leg IK. Joint a (hip / shoulder) is fixed where it is now;
 * joint d (ball of the foot / paw / hand) goes to F (model space); the last
 * segment c->d keeps the given angle `endAng` (from down, + toward +z).
 * `bend` +1 bends the middle joint forward (a dog's elbow is -1, a knee +1).
 * `pitch` is the total x-rotation of the parent chain above joint a.
 */
export function legIK(K: KitRig, L: LegChain, F: V3, endAng: number, bend: number, pitch: number, H: THREE.Vector3, stretch = 1) {
  const [A, Bn, C] = L.names, [ra, rb, rc, rd] = L.rest;
  const P = K.parts;
  const L1 = Math.hypot(rb[1] - ra[1], rb[2] - ra[2]) * stretch, L2 = Math.hypot(rc[1] - rb[1], rc[2] - rb[2]) * stretch, L3 = Math.hypot(rd[1] - rc[1], rd[2] - rc[2]);
  const a1r = segAng(ra, rb), a2r = segAng(rb, rc), a3r = segAng(rc, rd);
  // ankle target from the foot target and the fixed end segment
  const Cy = F[1] + L3 * Math.cos(endAng), Cz = F[2] - L3 * Math.sin(endAng), Cx = F[0];
  const dx = Cx - H.x, down = Math.hypot(H.y - Cy, dx) * (H.y - Cy >= 0 ? 1 : -1), dz = Cz - H.z;
  const roll = Math.atan2(dx, Math.max(0.05, H.y - Cy));
  let d = Math.hypot(down, dz);
  d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(L1 + L2 - 1e-3, d));
  const beta = Math.atan2(dz, down);
  const gam = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const a1 = beta + bend * gam;
  const kz = L1 * Math.sin(a1), kd = L1 * Math.cos(a1);
  const a2 = Math.atan2(dz - kz, down - kd);
  const t1 = a1r - a1 - pitch, t2 = a2r - a2 - pitch - t1, t3 = a3r - endAng - pitch - t1 - t2;
  const o = P[A]; if (o.rotation.order !== 'ZXY') o.rotation.order = 'ZXY';
  o.rotation.set(t1, 0, roll);
  P[Bn].rotation.set(t2, 0, 0);
  P[C].rotation.set(t3, 0, 0);
}
/** rest positions (model space) of a joint list */
export function restOf(K: KitRig, names: string[]): V3[] {
  const e = K.kit.entry, idx = new Map(e.bones.map((b, i) => [b.name, i] as const));
  return names.map((n) => e.rest[idx.get(n)!]);
}
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ------------------------------------------------------------------ the whips: follow-the-leader history per stalk
const HN = 128, HS = 1 / 120;
interface Whip { ax: Float32Array; az: Float32Array; i: number; acc: number }
function whips(K: KitRig): Whip[] {
  return (K.kit.m.wh ??= [0, 1].map(() => ({ ax: new Float32Array(HN).fill(0.6), az: new Float32Array(HN).fill(0), i: 0, acc: 0 }))) as Whip[];
}
function whipPush(w: Whip, ax: number, az: number, dt: number) {
  w.acc += Math.min(dt, 0.1);
  while (w.acc >= HS) { w.acc -= HS; w.i = (w.i + 1) % HN; w.ax[w.i] = ax; w.az[w.i] = az; }
}
function whipAt(w: Whip, back: number): [number, number] {
  const b = Math.max(0, Math.min(HN - 2, back)), f = Math.floor(b), fr = b - f;
  const i0 = (w.i - f + HN * 2) % HN, i1 = (i0 - 1 + HN) % HN;
  return [w.ax[i0] + (w.ax[i1] - w.ax[i0]) * fr, w.az[i0] + (w.az[i1] - w.az[i0]) * fr];
}

// ------------------------------------------------------------------ the pose
export interface RatDrive {
  t: number; dt: number; speed: number; md: string; seed: number;
  /** aim (model space): yaw from +z toward +x, pitch up; how far; 0..1 whether there is anything to look at */
  lyaw: number; lpitch: number; ld: number; look: number;
  /** seconds into a strike (-1 none) */ wT: number; gT: number;
  hold: number; back: number; dead: number; flinch: number;
  /** an ordinary bite (the manager's attack): 0..1 */ bite: number;
  /** yaw rate of the body (rad/s): the whips and the tail lag behind turns */ turn: number;
}
const WHIP_WIND = 0.32, WHIP_CRACK = 0.12, GRAB_REACH = 0.38;

function poseRat(K: KitRig, d: RatDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, dt = d.dt, s9 = d.seed * 9;
  const is = (m: string) => (d.md === m ? 1 : 0);
  const alive = 1 - d.dead;
  const stalk = sm(ud, 'stalk', is('stalk') + is('prowl') * 0.45 + is('peek') * 0.6 + is('drag') * 0.5, 3, dt);
  const amb = sm(ud, 'amb', is('ambush'), 2.5, dt), peek = sm(ud, 'peek', is('peek'), 3, dt);
  const feed = sm(ud, 'feed', is('feed'), 3, dt), rec = sm(ud, 'rec', is('recoil') + is('flee') * 0.6, 6, dt);
  const haul = sm(ud, 'haul', is('haul'), 3, dt), drag = sm(ud, 'drag', is('drag'), 4, dt);
  const run = sm(ud, 'run', clamp01((d.speed - 1.6) / 1.6), 4, dt);
  const dead = d.dead, bite = d.bite;
  // ---- strike envelopes
  const wT = d.wT, gT = d.gT;
  const wind = wT >= 0 ? ease(wT / WHIP_WIND) * (1 - ease((wT - WHIP_WIND) / 0.06)) : 0;
  const crack = wT >= WHIP_WIND ? 1 - ease((wT - WHIP_WIND - WHIP_CRACK - 0.25) / 0.4) : 0;
  const brace = Math.max(wind, crack * 0.7, gT >= 0 ? 1 - ease((gT - 1.4) / 0.5) : 0);
  const reach = gT >= 0 ? ease(gT / GRAB_REACH) * (1 - ease((gT - 1.1) / 0.5)) : 0;
  const hold = sm(ud, 'hold', Math.max(d.hold, gT > GRAB_REACH + 0.1 && gT < 1.2 ? 1 : 0), 10, dt);
  // over the back: reaching, or carrying a thing in the hand (a survivor or a carcass is dragged behind instead)
  const over = sm(ud, 'over', Math.max(reach, d.hold > 0 && !is('feed') && !is('drag') ? 0.85 : 0), 6, dt);
  // ---- gait (phase-driven, stride matched to speed so paws do not slide)
  const stride = 0.3 + 0.28 * run;
  const dir = d.back ? -1 : 1;
  ud.ph = (ud.ph ?? s9) + dt * d.speed * (0.62 * Math.PI * 2 / stride) * dir;
  const ph = ud.ph, mv = clamp01(d.speed / 0.5) * alive;
  // ---- the body: hunched, low when it stalks, flat on its belly in ambush, rocking in a bound
  const br = Math.sin(t * (2.2 + rec * 3 + crack * 2) + s9) * alive;
  const bound = run * Math.sin(ph * 2);
  const low = 0.1 * stalk + 0.27 * amb + 0.06 * feed + 0.05 * brace + 0.08 * rec + 0.04 * drag;
  const pv = P.pelvis, sp = P.spine, ch = P.chest;
  const p0 = (o: THREE.Object3D) => o.userData.p0 as THREE.Vector3;
  P.base.position.set(Math.sin(t * 70) * 0.012 * d.flinch, 0, -0.08 * rec);
  pv.position.set(p0(pv).x, p0(pv).y - low + Math.abs(Math.sin(ph)) * 0.012 * mv + bound * 0.03 - 0.25 * dead, p0(pv).z);
  const pp = -0.06 * amb + 0.08 * stalk + bound * 0.12 + 0.05 * brace + 0.06 * haul * Math.sin(t * 3);
  pv.rotation.set(pp, Math.sin(ph) * 0.06 * mv * (1 - run) - d.turn * 0.05, Math.sin(ph * 0.5) * 0.02 * mv);
  const sx = -0.14 * stalk + 0.16 * amb - bound * 0.2 + 0.1 * feed - 0.12 * rec + br * 0.015;
  sp.rotation.set(sx, -d.turn * 0.06 + Math.sin(ph + 1) * 0.04 * mv, 0);
  sp.scale.set(1 + br * 0.03, 1 + br * 0.02, 1 + run * 0.06 * Math.sin(ph * 2 + 1));
  const cx = 0.1 * stalk - 0.08 * amb + bound * 0.14 + 0.16 * feed + 0.1 * brace - 0.06 * rec;
  ch.rotation.set(cx, -d.turn * 0.05, 0);
  ch.scale.set(1 + br * 0.035, 1 + br * 0.03, 1);
  // ---- legs: IK to the floor (paw targets cycle; the body sinks and the legs fold under it)
  const lp = ud.legs ? (K.kit.m.legRest as Record<string, LegChain>) : null;
  const legs = lp ?? (K.kit.m.legRest = Object.fromEntries(SIDES.flatMap(([s]) => [
    ['f' + s, { names: ['scap' + s, 'elbow' + s, 'wrist' + s], rest: restOf(K, ['scap' + s, 'elbow' + s, 'wrist' + s, 'fpaw' + s]) as LegChain['rest'] }],
    ['h' + s, { names: ['hip' + s, 'knee' + s, 'ankle' + s], rest: restOf(K, ['hip' + s, 'knee' + s, 'ankle' + s, 'hpaw' + s]) as LegChain['rest'] }],
  ])) as Record<string, LegChain>);
  ud.legs = 1;
  const hindPitch = pp, frontPitch = pp + sx + cx;
  K.root.updateMatrixWorld(true);
  const HP: Record<string, THREE.Vector3> = {};
  for (const [s] of SIDES) { HP['f' + s] = jointPos(K, 'scap' + s, new THREE.Vector3(), false); HP['h' + s] = jointPos(K, 'hip' + s, new THREE.Vector3(), false); }
  const stepF = (off: number) => {
    const u = (((ph + off) / (Math.PI * 2)) % 1 + 1) % 1;
    const sw = u >= 0.62, s = sw ? (u - 0.62) / 0.38 : u / 0.62;
    const z = sw ? -stride / 2 + stride * ease(s) : stride / 2 - stride * s;
    const lift = sw ? Math.sin(Math.PI * s) * (0.05 + 0.05 * run) : 0;
    return [z * mv * (1 - amb), lift * mv * (1 - amb)];
  };
  for (const [s, k] of SIDES) {
    // walk: diagonal pairs; bound: fronts together, hinds together
    const offF = k > 0 ? 0 : Math.PI * (1 - run * 0.85), offH = (k > 0 ? Math.PI : 0) * (1 - run) + run * (Math.PI + (k > 0 ? 0.25 : 0));
    const [zf, lf] = stepF(offF), [zh, lh] = stepF(offH);
    const fr = legs['f' + s].rest, hr = legs['h' + s].rest;
    // haul: the front paws dig in and push; in ambush they are tucked under, splayed
    const fSpread = k * (0.02 + 0.05 * amb), hSpread = k * (0.02 + 0.06 * amb);
    if (dead < 0.5) {
      legIK(K, legs['f' + s], [fr[3][0] + fSpread, 0.022 + lf, fr[3][2] + zf - 0.04 * amb + 0.05 * feed + 0.05 * bite], 0.9 + lf * 4 - 0.4 * amb, -1, frontPitch, HP['f' + s]);
      legIK(K, legs['h' + s], [hr[3][0] + hSpread, 0.022 + lh, hr[3][2] + zh + 0.06 * amb - 0.04 * brace], 1.15 - lh * 3 + 0.3 * amb, 1, hindPitch, HP['h' + s]);
      P['fpaw' + s].rotation.set(-0.3 * lf * 8 + 0.2 * amb, 0, 0);
      P['hpaw' + s].rotation.set(0.4 * lh * 6, 0, 0);
    } else {
      // dead: limp, folded
      P['scap' + s].rotation.set(0.6, 0, k * 0.4); P['elbow' + s].rotation.set(-1.0, 0, 0); P['wrist' + s].rotation.set(0.9, 0, 0);
      P['hip' + s].rotation.set(-0.5, 0, k * 0.3); P['knee' + s].rotation.set(1.2, 0, 0); P['ankle' + s].rotation.set(-1.0, 0, 0);
    }
  }
  // ---- neck & head: low and forward when hunting, sniffing, tossed back for the crack, buried in the meal when feeding
  const look = d.look * alive;
  const lyaw = Math.max(-1.2, Math.min(1.2, d.lyaw)) * look, lpitch = Math.max(-0.6, Math.min(0.5, d.lpitch)) * look;
  const sniff = Math.sin(t * 19 + s9) * (0.5 + 0.5 * Math.sin(t * 0.7 + s9)) * (1 - feed) * alive;
  const chew = feed * Math.max(0, Math.sin(t * 11));
  P.neck.rotation.set(0.25 * stalk - 0.12 * amb + 0.5 * feed - 0.25 * wind + 0.2 * crack + 0.3 * dead - lpitch * 0.4 + 0.35 * bite, lyaw * 0.45 + Math.sin(t * 0.6 + s9) * 0.12 * (1 - look) * alive, 0);
  P.head.rotation.set(-0.1 * stalk + sniff * 0.025 + chew * 0.2 + 0.35 * feed - lpitch * 0.4 - 0.3 * wind + 0.25 * crack, lyaw * 0.35, Math.sin(t * 0.4 + s9) * 0.08 * alive);
  P.nose.rotation.set(sniff * 0.08, sniff * 0.05, 0);
  P.jaw.rotation.set(0.05 + 0.4 * Math.max(0, Math.sin(t * 13)) * feed + 0.35 * wind + 0.5 * rec * (0.6 + 0.4 * Math.sin(t * 20)) + 0.4 * reach + 0.3 * dead + 0.15 * brace + 0.75 * bite, 0, 0);
  for (const [s, k] of SIDES) {
    const flick = Math.pow(Math.max(0, Math.sin(t * 1.3 + k * 2 + s9)), 20);
    P['ear' + s].rotation.set(-0.5 * (stalk + rec + brace) + flick * 0.4, k * (0.3 * Math.sin(t * 0.5 + k) * (1 - stalk) - lyaw * 0.3 * k), k * (0.6 * (stalk + rec + brace * 0.5)));
  }
  // ---- the eye stalks: each segment repeats where the root pointed a moment ago (a wave runs out to the tip)
  const W = whips(K);
  // base aim: up and forward, scanning on their own; toward the target; low and long around corners;
  // drawn back over the head for the crack, then flung at the target; curled tight in when the light hurts
  SIDES.forEach(([s, k], wi) => {
    const own = (Math.sin(t * (0.37 + wi * 0.11) + s9 + wi * 2) + 0.6 * Math.sin(t * (0.91 + wi * 0.2) + wi)) * (1 - look * 0.8);
    const tgtX = Math.PI / 2 - lpitch, tgtZ = -lyaw + k * -0.12;
    let ax = 0.45 + 0.25 * own + (tgtX - 0.45) * look * 0.85 + 0.55 * stalk + 0.75 * amb + 0.35 * peek;
    let az = k * -0.45 + own * 0.5 * k + (tgtZ - k * -0.45) * look * 0.85 - k * 0.5 * amb;
    // whip: wind back over the shoulders, then the crack (both lash, one a hair after the other)
    const lag = wi * 0.05;
    const wl = wT >= 0 ? ease((wT - lag) / WHIP_WIND) : 0, cr = wT >= WHIP_WIND + lag ? 1 : 0;
    if (wT >= 0) {
      const back = -0.9 - 0.3 * Math.sin(t * 9 + wi);
      ax = ax + (back - ax) * wl * (1 - cr);
      az = az * (1 - wl * 0.6);
      if (cr) { const u = clamp01((wT - WHIP_WIND - lag) / WHIP_CRACK); ax = back + (tgtX + 0.35 - back) * ease(u) - 0.3 * clamp01((wT - WHIP_WIND - lag - 0.3) / 0.4); az = tgtZ * 0.6 * ease(u); }
    }
    // recoil: pulled back and down against the skull
    ax = ax * (1 - rec) + (-0.6) * rec; az = az * (1 - rec) + k * -1.2 * rec;
    // dragging: the eyes arch back over its shoulders to watch what it has hold of
    ax = ax * (1 - drag) + (-0.7 + 0.15 * Math.sin(t * 1.3 + wi)) * drag; az = az * (1 - drag) + k * -0.35 * drag;
    if (dead > 0) { ax = ax * (1 - dead) + 1.5 * dead; az = az * (1 - dead) + k * -0.9 * dead; }
    // follow body turns (the stalks swing out on the far side)
    az += d.turn * 0.08 * k;
    const w = W[wi];
    whipPush(w, ax, az, dt);
    const LAG = wT >= WHIP_WIND ? 1.1 : 2.6 - stalk * 0.6;
    let px = 0, pz = 0, pk = 1;
    for (let i = 0; i < NS; i++) {
      const [hx, hz] = whipAt(w, i * LAG);
      const f = i / (NS - 1);
      // droop (heavier eye at the end), a slow writhe, a curl at the tip when idle, a ripple of the ring muscles
      const droop = (0.05 + 0.11 * dead + 0.06 * amb) * f * f;
      // an S that travels out along the stalk: the whips are never straight
      const writhe = (Math.sin(t * 2.6 - i * 0.95 + wi * 1.7 + s9) * 0.16 + Math.sin(t * 6.1 - i * 1.4 + wi) * 0.04 * (1 + crack)) * (0.35 + f) * alive * (1 - rec * 0.7) * (1 - 0.5 * look * peek);
      const side = Math.sin(t * 1.9 - i * 0.8 + wi * 2.9 + s9 * 1.3) * 0.13 * (0.3 + f) * alive * (1 - rec * 0.7);
      const curl = (0.22 * (1 - look) * (1 - amb) + 0.35 * rec) * f * f * alive - 0.12 * (1 - f) * (1 - look) * alive;
      const ax_i = hx + droop + curl + writhe, az_i = hz + side * k;
      const o = P['es' + s + i];
      o.rotation.set(ax_i - px, 0, az_i - pz);
      // the ring muscles: a pulse that runs out along the stalk (scales are relative: children inherit them)
      const pulseK = 1 + 0.07 * Math.sin(t * 6 - i * 1.4 + wi) * alive + 0.1 * crack * Math.sin(t * 40 - i * 2);
      o.scale.set(pulseK / pk, i ? 1 - rec * 0.09 + 0.03 * peek : 1, pulseK / pk);
      pk = pulseK; px = ax_i; pz = az_i;
    }
    // the eye itself: swivels toward the target at the end of the stalk, blinks rarely
    const blink = Math.pow(Math.max(0, Math.sin(t * 0.45 + wi * 2.3 + s9)), 60);
    P['eye' + s].rotation.set(look * -0.2, 0, 0);
    P['eye' + s].scale.set((1 - blink * 0.2 + crack * 0.1) / pk, (1 - blink * 0.5) / Math.pow(1 - rec * 0.09 + 0.03 * peek, NS - 1), (1 - blink * 0.2 + crack * 0.1) / pk);
  });
  // ---- the tail-arm: trails on the floor in an S, the fingers walking; or arcs over the back, the hand reaching past the head
  const tw = (i: number, sp_: number, amp: number) => Math.sin(t * sp_ - i * 0.65 + s9) * amp * (0.4 + i / NT);
  const fingersWalk = Math.max(0, Math.sin(t * 3 + s9)) * (1 - over) * alive;
  // trailing: down to the floor, then level along it; the hand palm-down
  const TR = [-0.55, -0.32, -0.12, 0.4, 0.42, 0.12, 0.05, 0.0, 0.0, 0.0];
  // arched over the back (a scorpion's tail), the forearm level over the head, the hand pitched down at the end
  const OV = [0.78, 0.82, 0.78, 0.7, 0.12, 0.0, -0.04, 0.05, 0.25, 0.35];
  // planted (haul): the arc reaches further and the hand comes down on the floor ahead
  // hauling: the arm swings round the haunch along the floor, the hand plants beside the shoulder and the body is pulled up to it
  // (pitch only where it drops to the floor, then pure yaw: mixing them would roll the later joints up off the floor)
  const HUX = [-0.85, 0.74, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.02];
  const HUY_R = [0.0, 0.05, 0.42, 0.5, 0.5, 0.46, 0.4, 0.3, 0.16, 0.04], HUY_P = [0.0, 0.12, 0.55, 0.62, 0.6, 0.55, 0.45, 0.36, 0.22, 0.1];
  // dragging a body: taut behind it, a little off the floor, the hand shut on an ankle
  const DRG = [-0.22, -0.06, 0.0, 0.02, 0.0, 0.0, 0.0, 0.02, 0.06, 0.1];
  const hc = haul > 0.01 ? ((live() ? G.time : t) * 0.9 + d.seed) % 1 : 0;
  const plant = haul * (hc < 0.35 ? ease(hc / 0.35) : hc < 0.85 ? 1 : 1 - ease((hc - 0.85) / 0.15));
  const pull = haul * (hc > 0.4 && hc < 0.85 ? ease((hc - 0.4) / 0.45) : hc >= 0.85 ? 1 - ease((hc - 0.85) / 0.15) : 0);
  const hside = VARS[K.kit.entry.variant].torn > 0 ? 1 : -1;
  for (let i = 0; i < NT; i++) {
    const trail = TR[i] + tw(i, 1.9, 0.04);
    const ov = OV[i] + (i >= 7 ? -0.18 * (1 - reach) * Math.max(0, d.hold) : 0);
    let ax = trail * (1 - over) + ov * over;
    ax = ax * (1 - haul) + HUX[i] * haul;
    ax = ax * (1 - drag) + DRG[i] * drag;
    if (dead > 0) ax = ax * (1 - dead) + (i < 2 ? -0.5 : i < 4 ? 0.3 : 0.02) * dead;
    // side-to-side: an S-wave along the floor, lagging the body's turns; over the back it aims at the target
    let ay = (tw(i, 1.7, 0.16) * (1 - over * 0.8) * (1 - drag * 0.7) - d.turn * 0.05 * (1 + i * 0.25) * (1 - over) + (i === 0 ? lyaw * 0.25 * over : 0) + (i === 4 ? lyaw * 0.3 * over : 0)) * alive;
    ay = ay * (1 - haul) + hside * (HUY_R[i] * (1 - pull) + HUY_P[i] * pull) * haul;
    // the forearm turns over as it comes over the back so the palm faces down at the end
    const twist = i >= 5 ? (Math.PI / 5) * over : 0;
    P['t' + i].rotation.set(ax, ay, twist);
  }
  // the hand: flexes at the wrist; fingers spread to reach, curl to grip, drum the floor when bored
  P.thand.rotation.set(-0.15 * (1 - over) + 0.25 * reach - 0.15 * plant + 0.2 * drag + Math.sin(t * 2.3) * 0.05 * alive * (1 - drag), 0, 0);
  const grip = Math.max(hold, plant > 0.9 ? 1 : 0, dead * 0.7);
  // the fingers drum on the floor when it is bored (a slow, unbearable patience)
  const drum = Math.max(0, Math.sin(t * 9)) * fingersWalk * 0.35;
  poseHand(K, P.thand.rotation.x, 0.25 + drum + grip * 0.75 + Math.sin(t * 1.3) * 0.04 * alive, reach * (1 - hold));
  // ---- the item or meal it is carrying, held in the hand
  const it = K.kit.m.item as THREE.Object3D | undefined;
  if (it) it.visible = d.hold > 0.5;
  // ---- shine: hotter while it hunts
  if (K.eyes) for (const e of K.eyes) e.scale.setScalar((0.8 + 0.4 * look + 0.3 * crack) * (1 - dead));
}

/** show (or clear) an item mesh in the tail's hand */
function holdItem(K: KitRig, key: string | null) {
  const m = K.kit.m;
  if ((m.itemKey ?? null) === key) return;
  m.itemKey = key;
  (m.item as THREE.Object3D | undefined)?.removeFromParent();
  m.item = undefined;
  if (!key) return;
  const mesh = makeItemMesh(key);
  if (!mesh) return;
  const g = new THREE.Group(); g.add(mesh);
  g.position.set(0, -0.035, -0.08);
  K.parts.thand.add(g);
  m.item = g;
}

// ------------------------------------------------------------------ in-game animation
function animateRat(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); K.kit.m.legs = 0; K.kit.m.legRest = undefined; }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>, seed = hashId(c.id, 7);
  rig.root.scale.setScalar(VARS[v].scale);
  // what it is looking at: its target, its prey, where it heard something
  let lyaw = 0, lpitch = 0, ld = 9, look = 0;
  const tg = n.tg ? (G.players?.get(n.tg) ?? CS()?.creatures?.get(n.tg)) : null;
  const lx = tg ? tg.x : n.lx, lz = tg ? tg.z : n.lz;
  if (lx !== undefined && lz !== undefined && !c.dead) {
    const dx = lx - c.x, dz = lz - c.z;
    ld = Math.hypot(dx, dz);
    const a = Math.atan2(dz, dx);
    let rel = a - c.facing; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    // model yaw is toward +x = the creature's left; world angle increases to the right of facing in this frame
    lyaw = -rel; lpitch = Math.atan2((tg && 'body' in tg ? 1.2 : 0.4) - 0.5, Math.max(0.5, ld)); look = 1;
  }
  const turn = (() => { let df = c.facing - (ud.lf ?? c.facing); while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2; ud.lf = c.facing; return Math.max(-4, Math.min(4, df / Math.max(1e-3, dt))); })();
  ud.trn = (ud.trn ?? 0) + (turn - (ud.trn ?? 0)) * Math.min(1, dt * 6);
  const now = live() ? G.time : t;
  const wT = n.wT !== undefined && now - n.wT < 1.2 ? now - n.wT : -1;
  const gT = n.gT !== undefined && now - n.gT < 1.8 ? now - n.gT : -1;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'crack') { playAt('swing', c, 0.9, 14, 1.5); setTimeout(() => playAt('equip', c, 1, 16, 1.7), 140); }
    else if (f.key === 'grab') playAt('dmg_grab', c, 0.9, 12, 0.8);
    else if (f.key === 'squeal') playAt('ventling_squeal', c, 0.9, 18, 0.75);
    else if (f.key === 'hiss') playAt('gloam_hiss', c, 0.8, 12, 1.1);
    else if (f.key === 'bite') playAt('gloam_bite', c, 0.9, 12, 0.9);
  }
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 1.5) : 0;
  holdItem(K, c.dead ? null : (n.it ?? null));
  const ac = attackCurve(rig, c, t);
  poseRat(K, {
    t, dt, speed: c.speed, md: c.dead ? '' : (n.md ?? ''), seed, lyaw, lpitch, ld, look,
    wT, gT, hold: n.hold ? 1 : 0, back: 0,
    dead: ease(ud.dk), flinch: flinchOf(c), turn: ud.trn, bite: Math.max(ac.wind, ac.strike),
  });
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  // eye-shine only in the dark (and only toward the local survivor's side of things)
  if (rig.eyes) {
    const z = live() && G.zone?.key === c.zoneKey ? G.zone : null;
    const dark = z ? lightAt(z, c.x, c.z) < 0.4 : true;
    for (const e of rig.eyes) e.visible = e.visible && dark && !c.dead;
  }
  // claws on the floor, the hand dragging behind
  if (c.speed > 0.3 && c.visibleToLocal && (ud.sndT ?? 0) < t) { ud.sndT = t + (c.speed > 2 ? 0.18 : 0.42); playAt('swivel_skitter', c, 0.22 + Math.min(0.3, c.speed * 0.08), 9, 0.55 + Math.random() * 0.1); }
  dragLocal(rig, c, n, t, dt);
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal) {
    const dd = dist(p, c);
    if (n.md === 'peek' && dd < 12) thinkOnce(p, 'rat_peek', 'Two eyes. On stalks. Coming round the corner before the rest of it.', 60);
    else if (n.md === 'drag' && n.pv && dd < 12) thinkOnce(p, 'rat_drag', 'It is dragging something into the dark. With a hand. Its tail has a HAND.', 60);
    else if (n.md === 'feed' && dd < 10) thinkOnce(p, 'rat_feed', 'It is eating. Both eyes are on me while it eats.', 70);
    else if (dd < 8) thinkOnce(p, 'whip_rat', ['A rat. The size of a dog. Its eyes are on— on stalks.', 'That tail ends in a hand. A person\'s hand. The nails are clean.', 'Its eyes keep moving when it doesn\'t. They are looking at me from two sides.'][Math.floor(t * 0.13) % 3], 90);
  }
}

/** the victim's machine: the hand has an ankle and the rat is backing into the dark */
function dragLocal(rig: Rig, c: Creature, n: Record<string, any>, t: number, dt: number) {
  const p = G?.local as Player | undefined;
  const ud = rig.root.userData;
  const on = !!p && live() && n.drag === p.id && !p.body.dead && !c.dead;
  if (on) {
    if (!ud.dragOn) { ud.dragOn = 1; G.audio?.flat?.('dread_hit', 'music', 0.5); bus.emit('subtitle', { who: '', text: 'The hand— it has my ankle—', dur: 2, style: 'self' }); }
    // the hand is at the end of the tail, behind it: it walks off into the dark and you come too
    const fx_ = Math.cos(c.facing), fz = Math.sin(c.facing);
    const tx = c.x - fx_ * DRAG_BACK, tz = c.z - fz * DRAG_BACK;
    p.x += (tx - p.x) * Math.min(1, dt * 6); p.z += (tz - p.z) * Math.min(1, dt * 6);
    p.vx *= 0.2; p.vz *= 0.2;
    G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.2);
    if (((t * 2) | 0) !== (((t - dt) * 2) | 0)) G.camera?.shake?.(0.15, 0.3, 0.6);
  } else if (ud.dragOn) ud.dragOn = 0;
}

// ------------------------------------------------------------------ host brain
const PREY = new Set(['hum_possum', 'paper_grazer', 'tallow_pigeon', 'mulcher', 'moon_calf', 'bubble_rabbit']);
const DRAG_T = 2.8, FEED_T = 14, WHIP_RANGE = 2.5, GRAB_RANGE = 2.2;
/** how far behind it the tail's hand holds what it drags */
const DRAG_BACK = 2.15;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
const darkAt = (c: Creature, x: number, z: number) => lightAt(zoneOf(c), x, z);

function preyNear(c: Creature, r: number): Creature | null {
  let best: Creature | null = null, bd = r;
  for (const o of CS().creatures.values()) {
    if (o.zoneKey !== c.zoneKey || o === c || !PREY.has(o.sp.key) || (o.dead && o.butchered) || o.mem.ratHeld) continue;
    const d = dist(o, c);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
/** a dark place to take things to */
function lairOf(c: Creature): { x: number; z: number } {
  const m = c.mem;
  if (!m.lair || G.time - (m.lairT ?? 0) > 120) {
    m.lair = findSpot(c, { x: c.home.x, z: c.home.z, rMin: 0, rMax: 9, dark: 0.35, tries: 40 }) ?? findSpot(c, { rMin: 2, rMax: 12, dark: 0.5 }) ?? { x: c.home.x, z: c.home.z };
    m.lairT = G.time;
  }
  return m.lair;
}
/** move toward (x,z) keeping to the dark where it can */
function creep(c: Creature, x: number, z: number, speed: number, dt: number, stopAt = 0.6) {
  return CS().moveTo(c, zoneOf(c), x, z, speed, dt, stopAt);
}
/** host: hit the local or remote survivor with a custom blow */
function hitPlayer(c: Creature, p: Player, h: Partial<HitInfo>) {
  const hit: HitInfo = { dmg: 6, kinds: ['laceration'], corrupt: 0.02, height: 1.4, knock: 0.2, from: [c.x, c.z], grab: false, by: 'whip_rat', ...h } as HitInfo;
  if (p.isLocal) applyHitToPlayer(p, hit); else G.net?.sendHurt?.(p.id, hit);
}

function thinkRat(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c);
  restoreStore(c, 'ratItems');
  if (!m.init) {
    m.init = 1; m.hunger = rng.float(0.3, 0.9);
    // in lit places (the lobby's edges), it moves its home into the nearest dark corner
    if (darkAt(c, c.x, c.z) > 0.45) { const d = findSpot(c, { rMin: 2, rMax: 14, dark: 0.4, tries: 40 }); if (d) c.home = { x: d.x, z: d.z }; }
  }
  m.mdT = (m.mdT ?? 0) + dt;
  m.hunger = Math.min(1, (m.hunger ?? 0.5) + dt / 220);
  m.whipCd = Math.max(0, (m.whipCd ?? 0) - dt); m.grabCd = Math.max(0, (m.grabCd ?? 0) - dt);
  const md: string = n.md ?? '';
  // ---- hurt: lets go of whatever it has, squeals; badly hurt, it runs for the dark
  if (ev.hurt > 0) {
    if (n.drag) { n.drag = null; m.grabCd = 6; }
    if (n.pv) dropPrey(c);
    if (n.it) { dropStored(c, 'ratItems'); n.it = null; n.hold = 0; }
    fx(c, 'squeal');
    if (c.hp < c.sp.hp * 0.32) { setMd(c, 'flee'); m.fleeTo = findSpot(c, { rMin: 8, rMax: 18, dark: 0.35 }) ?? cs.fleeSpot(c, z, c.x - Math.cos(c.facing), c.z - Math.sin(c.facing)); }
    else if (c.targetId && G.players.has(c.targetId)) { m.anger = G.time + 20; n.tg = c.targetId; }
  }
  // ---- the light rule: a beam held on it makes it pull its eyes in and back off into the dark
  const beam = beamOn(z, c.x, c.z, 11);
  if (beam && md !== 'flee' && md !== 'recoil' && !n.drag && md !== 'whip' && md !== 'grab') {
    { setMd(c, 'recoil'); fx(c, 'squeal'); m.recFrom = { x: beam.x, z: beam.z }; m.recTo = findSpot(c, { rMin: 4, rMax: 10, dark: 0.35, pred: (x, y) => Math.hypot(x - beam.x, y - beam.z) > dist(beam, c) + 2 }) ?? cs.fleeSpot(c, z, beam.x, beam.z); if (dist(beam, c) < 8) ruleShown(c); }
  }
  if (md === 'recoil') {
    c.setState('flee');
    if (m.mdT < 0.5) { stop(c); faceTo(c, m.recFrom?.x ?? c.x, m.recFrom?.z ?? c.z); return true; }
    if (!m.recTo || creep(c, m.recTo.x, m.recTo.z, c.sp.run * 0.8, dt) || m.mdT > 4) {
      const b2 = beamOn(z, c.x, c.z, 11);
      if (!b2) setMd(c, 'lurk');
      // cornered in the beam and you keep coming: it lashes out
      else if (m.mdT > 5 && dist(b2, c) < WHIP_RANGE && m.whipCd <= 0) startWhip(c, b2);
    }
    return true;
  }
  if (md === 'flee') {
    c.setState('flee');
    if (!m.fleeTo || creep(c, m.fleeTo.x, m.fleeTo.z, c.sp.run, dt) || m.mdT > 8) { setMd(c, 'lurk'); c.home = { x: c.x, z: c.z }; m.lair = null; }
    return true;
  }
  // ---- dragging a survivor: backing into the dark, biting
  if (n.drag) {
    const p = G.players.get(n.drag) as Player | undefined;
    if (!p || p.body.dead || p.zoneKey !== c.zoneKey || m.mdT > DRAG_T || dist(p, c) > DRAG_BACK + 1.4) {
      n.drag = null; n.hold = 0; m.grabCd = 7; fx(c, 'hiss');
      // it lets go and turns on you: a bite while you are down
      if (p && !p.body.dead && dist(p, c) < DRAG_BACK + 1.4) { setMd(c, 'stalk'); m.anger = G.time + 8; } else setMd(c, 'lurk');
      return true;
    }
    setMd(c, 'drag'); c.setState('attack');
    // walks off toward the dark, away from you, dragging you behind by the ankle; the hand squeezes and twists
    const L = lairOf(c);
    const away = Math.atan2(c.z - p.z, c.x - p.x), toL = Math.atan2(L.z - c.z, L.x - c.x);
    const a = Math.hypot(L.x - c.x, L.z - c.z) > 1.5 ? toL : away;
    const nx = c.x + Math.cos(a) * 0.5, nz = c.z + Math.sin(a) * 0.5;
    if (walkable(z, Math.floor(nx), Math.floor(nz)) && lineOfSightB(z, c.x, c.z, nx, nz)) { c.targetFacing = a; c.vx = Math.cos(a) * 1.05; c.vz = Math.sin(a) * 1.05; c.speed = 1.05; }
    else { stop(c); c.targetFacing = away; }
    if ((m.biteT ?? 0) < G.time) { m.biteT = G.time + 1.0; fx(c, 'grab'); hitPlayer(c, p, { dmg: rng.float(2, 5), kinds: ['bruise', 'scratch'], parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r'], height: 0.3, knock: 0 }); }
    return true;
  }
  // ---- carrying prey or an item home
  if (n.pv || n.it) {
    const L = lairOf(c);
    const prey = n.pv ? cs.creatures.get(n.pv) : null;
    if (n.pv && !prey) { n.pv = null; n.hold = 0; }
    setMd(c, n.pv ? 'drag' : 'carry'); c.setState('travel');
    if (prey) { prey.x = c.x - Math.cos(c.facing) * DRAG_BACK; prey.z = c.z - Math.sin(c.facing) * DRAG_BACK; prey.mem.ratHeld = c.id; }
    const arrived = creep(c, L.x, L.z, c.sp.walk * (n.pv ? 0.7 : 0.8), dt, 0.8);
    if (arrived || m.mdT > 25) {
      if (prey) { n.hold = 0; n.pv = null; setMd(c, 'feed'); m.feedT = 0; n.tg = prey.id; }
      else { dropStored(c, 'ratItems'); n.it = null; n.hold = 0; setMd(c, 'lurk'); fx(c, 'hiss'); }
    }
    return true;
  }
  // ---- feeding on a kill (it watches you over the meal)
  if (md === 'feed') {
    stop(c); c.setState('eat');
    const prey = n.tg ? cs.creatures.get(n.tg) : null;
    // hurt over its meal: it leaves the carcass and comes for you
    if (m.anger > G.time) { if (prey) prey.mem.ratHeld = null; n.tg = c.targetId; setMd(c, 'stalk'); return true; }
    m.feedT = (m.feedT ?? 0) + dt;
    if (prey && m.feedT < 0.3) faceTo(c, prey.x, prey.z);
    if (prey && dist(prey, c) > 1.0) { prey.x += (c.x + Math.cos(c.facing) * 0.75 - prey.x) * Math.min(1, dt * 3); prey.z += (c.z + Math.sin(c.facing) * 0.75 - prey.z) * Math.min(1, dt * 3); }
    if ((m.chewS ?? 0) < G.time) { m.chewS = G.time + rng.float(0.5, 1.1); playAt(rng.chance(0.5) ? 'gore_squelch' : 'bh_chew', c, 0.55, 10, 0.8 + rng.float(0, 0.3)); }
    const near = nearestP(c, 3.2);
    if (near && !m.anger) { faceTo(c, near.p.x, near.p.z); if (near.d < 2.2 && m.whipCd <= 0) { startWhip(c, near.p); return true; } if ((m.hissT ?? 0) < G.time) { m.hissT = G.time + 2; fx(c, 'hiss'); } }
    if (!prey || m.feedT > FEED_T) { if (prey) { prey.mem.ratHeld = null; cs.onButcher(prey); } m.hunger = Math.max(0, m.hunger - 0.6); n.tg = null; setMd(c, 'lurk'); }
    return true;
  }
  // ---- strikes in progress
  if (md === 'whip') {
    stop(c); c.setState('attack');
    const tgt = targetOf(c);
    if (tgt) faceTo(c, tgt.x, tgt.z);
    const tt = G.time - n.wT;
    if (!m.whipHit && tt >= WHIP_WIND + WHIP_CRACK * 0.7) {
      m.whipHit = 1; fx(c, 'crack');
      if (tgt && dist(tgt, c) < WHIP_RANGE + 0.5) {
        if ('body' in tgt) { const p = tgt as Player; hitPlayer(c, p, { dmg: rng.float(4, 8), kinds: ['laceration', 'scratch'], parts: ['head', 'neck', 'hand_l', 'hand_r', 'farm_l', 'farm_r'], height: 1.6, knock: 0.15 }); m.stunned = { id: p.id, until: G.time + 1.6 }; }
        else cs.damage(c.id, (tgt as Creature).id, rng.float(14, 26), c.x, c.z, 0.3, 'bite');
      }
    }
    if (tt > 0.95) {
      m.whipHit = 0; n.wT = undefined; m.whipCd = rng.float(2.5, 4);
      // a stunned survivor in reach: the hand comes over for them
      const p = tgt && 'body' in tgt ? tgt as Player : null;
      if (p && m.stunned?.id === p.id && G.time < m.stunned.until && dist(p, c) < GRAB_RANGE + 0.6 && m.grabCd <= 0) startGrab(c, p);
      else if (tgt && !('body' in tgt) && (tgt as Creature).dead) startGrab(c, tgt);
      else setMd(c, n.tg ? 'stalk' : 'lurk');
    }
    return true;
  }
  if (md === 'grab') {
    stop(c); c.setState('attack');
    const tgt = targetOf(c);
    if (tgt) faceTo(c, tgt.x, tgt.z);
    const tt = G.time - n.gT;
    if (!m.grabHit && tt >= GRAB_REACH) {
      m.grabHit = 1; fx(c, 'grab');
      const inReach = tgt && dist(tgt, c) < GRAB_RANGE + 0.5;
      if (inReach && 'body' in tgt!) {
        const p = tgt as Player;
        hitPlayer(c, p, { dmg: rng.float(3, 6), kinds: ['bruise', 'scratch'], parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r'], height: 0.3, knock: 0 });
        n.drag = p.id; n.hold = 1; m.grabCd = 8; setMd(c, 'drag'); return true;
      }
      if (inReach && tgt) { const o = tgt as Creature; if (!o.dead) cs.damage(c.id, o.id, 40, c.x, c.z, 0.1, 'bite'); n.pv = o.id; n.hold = 1; o.mem.ratHeld = c.id; return true; }
      if (inReach === false || !tgt) { /* missed */ }
    }
    if (tt > 1.3) { m.grabHit = 0; n.gT = undefined; m.grabCd = rng.float(3, 5); setMd(c, n.tg ? 'stalk' : 'lurk'); }
    return true;
  }
  // ---- choose a target: a survivor it has seen or heard close, or prey when hungry
  const tgtP = huntTarget(c);
  if (tgtP) {
    const p = tgtP, d = dist(p, c);
    n.tg = p.id;
    // it will not walk out into bright light unless it is angry
    const lit = darkAt(c, p.x, p.z) > 0.8 && !(m.anger > G.time);
    if (d < WHIP_RANGE && m.whipCd <= 0 && !lit) { startWhip(c, p); return true; }
    if (d < GRAB_RANGE && m.grabCd <= 0 && !lit && (p.stance === 'sneak' || p.speed < 0.6 || rng.chance(dt * 1.5))) { startGrab(c, p); return true; }
    if (d < 1.35 && c.attackT <= 0) { attack(c, p); return true; }
    // ambush: it is in the dark, unseen, and they are coming this way: hold still and let them come
    const closing = (m.lastD ?? d) - d > dt * 0.4;
    m.lastD = d;
    if (md === 'ambush' && m.mdT >= 9) m.ambCd = G.time + 8;
    if (!c.observed && darkAt(c, c.x, c.z) < 0.4 && d < 7 && (closing || md === 'ambush') && (m.ambCd ?? 0) < G.time) {
      setMd(c, 'ambush'); stop(c); faceTo(c, p.x, p.z); c.setState('stalk');
      if (d < 2.4 && m.whipCd <= 0) startWhip(c, p);
      return true;
    }
    if (lit) { setMd(c, 'stalk'); c.setState('stalk'); const edge = findSpot(c, { x: p.x, z: p.z, rMin: 3, rMax: 7, dark: 0.45 }); if (edge) creep(c, edge.x, edge.z, c.sp.walk * 0.6, dt); else stop(c); faceTo(c, p.x, p.z); return true; }
    // close the distance: low and slow at range, a scuttling rush at the end
    const rush = d < 4.5 || m.anger > G.time;
    setMd(c, rush ? 'run' : 'stalk'); c.setState(rush ? 'chase' : 'stalk');
    creep(c, p.x, p.z, rush ? c.sp.run : c.sp.walk * 0.7, dt, 1.0);
    return true;
  }
  if (n.tg && G.players.has(n.tg)) n.tg = null;
  m.lastD = undefined;
  // ---- heard something it cannot see: stop at the corner and send the eyes round first
  if (c.lastHeard && G.time - c.lastHeard.t < 4 && md !== 'peek' && (m.peekCd ?? 0) < G.time) {
    setMd(c, 'peek'); m.peekAt = { x: c.lastHeard.x, z: c.lastHeard.z }; m.peekCd = G.time + 6; n.lx = c.lastHeard.x; n.lz = c.lastHeard.z;
  }
  if (md === 'peek') {
    stop(c); c.setState('investigate');
    const pa = m.peekAt ?? { x: c.x, z: c.z };
    faceTo(c, pa.x, pa.z);
    if ((m.clickT ?? 0) < G.time) { m.clickT = G.time + rng.float(0.6, 1.4); playAt('stammer_click', c, 0.35, 9, 1.4); }
    // the eyes go out ahead of it: from up to a metre on toward the sound it can see round a corner
    const a = Math.atan2(pa.z - c.z, pa.x - c.x);
    const ex = c.x + Math.cos(a) * 0.9, ez = c.z + Math.sin(a) * 0.9;
    for (const p of playersIn(c.zoneKey)) {
      const dp = dist(p, c);
      if (dp > 10) continue;
      const still = p.stance === 'sneak' && p.speed < 0.2;
      if (!still && (lineOfSightB(z, ex, ez, p.x, p.z) || lineOfSightB(z, c.x, c.z, p.x, p.z))) { c.awareness.set(p.id, 1.2); c.targetId = p.id; c.lastSeen = { x: p.x, z: p.z, t: G.time }; }
    }
    if (m.mdT > 3.5) { setMd(c, 'prowl'); c.goal = { x: pa.x, z: pa.z }; n.lx = undefined; n.lz = undefined; }
    return true;
  }
  // ---- hungry: hunt the small things
  if (m.hunger > 0.45) {
    const prey = preyNear(c, 14);
    if (prey) {
      n.tg = prey.id;
      const d = dist(prey, c);
      if (prey.dead) { if (d < GRAB_RANGE && m.grabCd <= 0) { startGrab(c, prey); return true; } setMd(c, 'stalk'); creep(c, prey.x, prey.z, c.sp.walk, dt, 1.4); return true; }
      if (d < WHIP_RANGE && m.whipCd <= 0) { startWhip(c, prey); return true; }
      setMd(c, d < 4 ? 'run' : 'stalk'); c.setState('stalk');
      creep(c, prey.x, prey.z, d < 4 ? c.sp.run * 0.9 : c.sp.walk * 0.75, dt, 1.2);
      return true;
    }
  }
  if (n.tg && !G.players.has(n.tg)) n.tg = null;
  // ---- something left on the floor near its dark: the hand takes it
  if ((m.itemCd ?? 0) < G.time) {
    m.itemCd = G.time + 3;
    const wi = floorItemsAround(z, c.x, c.z, 5).find((w) => !isPrecious(w.item) && darkAt(c, w.x, w.z) < 0.55);
    if (wi && !playersIn(c.zoneKey).some((p) => dist(p, wi) < 2.5)) m.itemGoal = { uid: wi.item.uid, x: wi.x, z: wi.z };
  }
  if (m.itemGoal) {
    setMd(c, 'haul'); c.setState('travel');
    if (creep(c, m.itemGoal.x, m.itemGoal.z, c.sp.walk * 0.6, dt, 0.9)) {
      const wi = floorItemsAround(z, m.itemGoal.x, m.itemGoal.z, 1).find((w) => w.item.uid === m.itemGoal.uid);
      if (wi) { takeFloorItem(c, wi, 'ratItems'); n.it = wi.item.key; n.hold = 1; fx(c, 'grab'); }
      m.itemGoal = null;
    } else if (c.stateT > 12) m.itemGoal = null;
    return true;
  }
  // ---- nothing: lurk in its dark corner, the eyes going round; now and then move to another
  if (md === 'prowl' || md === 'haul') {
    c.setState('wander');
    // hauling: the hand plants ahead and the body is pulled after it, in surges
    const hc = (G.time * 0.9 + hashId(c.id, 7)) % 1;
    const sp = md === 'haul' ? (hc > 0.4 && hc < 0.85 ? c.sp.walk * 1.1 : 0.12) : c.sp.walk * 0.6;
    if (!c.goal || creep(c, c.goal.x, c.goal.z, sp, dt) || c.stateT > 18) { setMd(c, 'lurk'); c.goal = null; }
    return true;
  }
  if (md !== 'lurk') setMd(c, 'lurk');
  const home = lairOf(c);
  if (Math.hypot(home.x - c.x, home.z - c.z) > 1.2 && m.mdT < 20) { c.setState('travel'); creep(c, home.x, home.z, c.sp.walk * 0.7, dt); return true; }
  stop(c); c.setState('idle');
  if (m.mdT > (m.lurkT ?? (m.lurkT = rng.float(10, 24)))) {
    m.lurkT = undefined;
    const g = findSpot(c, { rMin: 5, rMax: 14, dark: 0.4 });
    if (g) { setMd(c, rng.chance(0.4) ? 'haul' : 'prowl'); c.goal = g; c.home = { x: g.x, z: g.z }; m.lair = null; return true; }
  }
  if (c.noiseCooldown <= 0 && rng.chance(dt * 0.05)) { playAt(rng.chance(0.5) ? 'stammer_click' : 'cower_squeak', c, 0.35, 10, 0.7); c.noiseCooldown = 7; }
  return true;
}
function targetOf(c: Creature): Player | Creature | null {
  const id = net(c).tg;
  if (!id) return null;
  return (G.players.get(id) as Player | undefined) ?? CS().creatures.get(id) ?? null;
}
function nearestP(c: Creature, r: number): { p: Player; d: number } | null {
  let best: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < r && (!best || d < best.d)) best = { p, d }; }
  return best;
}
/** a survivor it is hunting: one it is aware of (sight), one that hurt it, or footsteps close by in the dark */
function huntTarget(c: Creature): Player | null {
  const m = c.mem;
  let best: Player | null = null, bd = 18;
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c);
    const aware = (c.awareness.get(p.id) ?? 0) >= 1 && c.lastSeen && G.time - c.lastSeen.t < 6;
    const angry = m.anger > G.time && net(c).tg === p.id;
    // crouched and still: it loses you unless it is right on top of you
    const still = p.stance === 'sneak' && p.speed < 0.2 && d > 1.8 && !angry;
    if (still) continue;
    if ((aware || angry) && d < bd) { bd = d; best = p; }
  }
  return best;
}
function startWhip(c: Creature, t: Player | Creature) {
  const n = net(c);
  n.tg = t.id; n.wT = G.time; c.mem.whipHit = 0; setMd(c, 'whip'); fx(c, 'hiss');
}
function startGrab(c: Creature, t: Player | Creature) {
  const n = net(c);
  n.tg = t.id; n.gT = G.time; c.mem.grabHit = 0; setMd(c, 'grab');
}
function dropPrey(c: Creature) {
  const n = net(c), o = n.pv ? CS().creatures.get(n.pv) : null;
  if (o) o.mem.ratHeld = null;
  n.pv = null; n.hold = 0;
}

// ------------------------------------------------------------------ the species
const WHIP = def({
  key: 'whip_rat', name: 'Whip Rat', code: 'WR-04 // FAUNA, MURID (PREDATORY, DARK-ADAPTED)', temperament: 'ambush', threat: 4,
  rule: { name: 'LIGHT IN ITS EYES', text: 'It hunts in the dark: lurks, sends its eyes round corners on their stalks, waits low for you to walk past, whips you across the face and takes your ankle with the hand on its tail. Hold a torch beam on it and it pulls its eyes in and backs off into the dark. It will not follow you into bright light unless you hurt it. Crouch and keep still and it loses you.', tell: 'Something in the dark with two eyes that move on their own. Very low. Very patient.' },
  hp: 70, walk: 1.0, run: 3.6, turn: 5, radius: 0.42, height: 0.6, sight: 11, fov: 2.3, hearing: 1.4, nightVision: true, smell: true,
  attack: { dmg: [6, 11], range: 1.25, cooldown: 1.6, kinds: ['bite', 'laceration'], corrupt: 0.04, knock: 0.15, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r', 'thigh_l', 'thigh_r', 'hand_l', 'hand_r'] },
  zones: ['tunnels', 'undercroft', 'server', 'stairwell', 'lobby'], weight: 1, group: [1, 1], maxPerZone: 3, diet: 'meat',
  meat: [['meat_raw', 2]],
  sounds: { idle: 'stammer_click', alert: 'gloam_hiss', attack: 'gloam_bite', hurt: 'ventling_squeal', death: 'ventling_die', step: 'swivel_skitter' },
  scan: {
    cls: 'Fauna / murid, dark-adapted predator',
    notes: [
      'A rat the size of a large dog. Mangy, half-skinned in places; ribs and raw sinew show.',
      'Its eyes are on two long muscular stalks. They look round corners and lash like whips.',
      'Its tail becomes a human forearm and ends in a human hand. It grips, takes and drags.',
      'It avoids light. A beam held on it drives it back.',
    ],
  },
  gore: { blood: 'red', flesh: 0xa82a28, sever: ['esL2', 'esR2', 'eyeL', 'eyeR', 'earL', 'earR', 'elbowL', 'elbowR', 'kneeL', 'kneeR', 'jaw'], head: 'head' },
  build: () => buildWhipRat(0), animate: animateRat, think: thinkRat,
});
onPlayerHit('whip_rat', (p, h) => {
  // the eye-whip: across the face, it stuns
  if (h?.parts?.includes('head')) {
    p.actions.set(new HeldAction(p, 1.1, 'kneel', 'Stunned', 0.3));
    G.pr.fx.blink = Math.max(G.pr.fx.blink, 0.8); G.pr.fx.wobble = Math.max(G.pr.fx.wobble, 0.6);
    bus.emit('think', p, ['It hit me across the eyes with its EYES—', 'A crack like a belt. I can\'t see— I can\'t—', 'Something wet whipped my face. My ears are ringing.'][Math.floor(Math.random() * 3)]);
  } else bus.emit('think', p, ['Teeth. Yellow. In my leg.', 'It bit me. It is so much stronger than a rat.', 'The hand has my ankle. Kick it. KICK IT.'][Math.floor(Math.random() * 3)]);
});
TEARS.whip_rat = { parts: [['foot_l', 2], ['foot_r', 2], ['hand_l', 1], ['hand_r', 1]], chance: 0.04, hold: 1.5, verb: 'bite', with: /head|jaw/i, line: 'It is chewing— it is CHEWING—' };
defDread('whip_rat', { twitch: ['head', 'esL3', 'esR5', 'thand'], twitchRate: 0.35, skipDark: 0.35, sting: 'chase', cam: 0.7, flick: 5 });

// ------------------------------------------------------------------ stand-alone posing (gallery, the video)
export type WhipRatPose = 'idle' | 'walk' | 'run' | 'prowl' | 'stalk' | 'ambush' | 'peek' | 'whip' | 'grab' | 'drag' | 'haul' | 'feed' | 'recoil' | 'flee' | 'dead';
/**
 * Animate a whip rat rig with no game running: call every frame with a running clock.
 * `lookYaw`/`lookPitch` aim the eyes and head (model space: + yaw toward the rat's left).
 * 'whip' and 'grab' strike every 2.5 s unless `strikeT` pins the moment (seconds into the strike).
 * `item` puts an item (by key) in the tail's hand for 'drag' / 'haul'.
 */
export function poseWhipRat(rig: KitRig, t: number, dt: number, pose: WhipRatPose = 'idle', o: { variant?: number; speed?: number; lookYaw?: number; lookPitch?: number; strikeT?: number; hold?: boolean; item?: string } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant) { kitPersonalize(rig, o.variant); rig.kit.m.legs = 0; rig.kit.m.legRest = undefined; }
  kitSync(rig);
  const speeds: Partial<Record<WhipRatPose, number>> = { walk: 0.9, run: 3.4, prowl: 0.45, stalk: 0.35, drag: 0.8, haul: 0.4, flee: 3.4 };
  const st = o.strikeT ?? (t % 2.5);
  const lookOn = pose !== 'idle' && pose !== 'walk' && pose !== 'run' && pose !== 'flee' && pose !== 'dead' && pose !== 'haul';
  holdItem(rig, o.item && (pose === 'drag' || pose === 'haul' || pose === 'idle') ? o.item : null);
  poseRat(rig, {
    t, dt, speed: o.speed ?? speeds[pose] ?? 0, md: pose === 'run' || pose === 'walk' || pose === 'idle' || pose === 'dead' ? '' : pose, seed: 0.37,
    lyaw: o.lookYaw ?? (pose === 'peek' ? 0.7 : 0), lpitch: o.lookPitch ?? (pose === 'ambush' ? -0.05 : 0.15), ld: 3, look: lookOn ? 1 : 0,
    wT: pose === 'whip' ? st : -1, gT: pose === 'grab' ? st : -1, hold: o.hold || pose === 'drag' || (o.item && pose === 'haul') ? 1 : 0, back: 0,
    dead: pose === 'dead' ? 1 : 0, flinch: 0, turn: 0, bite: 0,
  });
  rig.kit.F.fx.value.y += dt;
}
WHIP.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['walk', 'stalk', 'peek', 'whip', 'grab', 'drag', 'ambush', 'haul'][Math.floor(t / 5) % 8]) as WhipRatPose;
  const num = (k: string) => (u.get(k) !== null ? Number(u.get(k)) : undefined);
  poseWhipRat(rig as KitRig, t, 1 / 60, q, { variant: num('v') ?? 0, strikeT: num('st'), lookYaw: num('ly'), item: u.get('item') ?? undefined });
};
horrify(WHIP, { twitch: 0.3, snap: 0.1, breathe: 0.004, lunge: 0.08, parts: /head|jaw|ear|nose|thand/, keepMaterials: false });
