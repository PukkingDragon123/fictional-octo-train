import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { op } from '../../game/ops';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { StruggleAction } from '../../combat/qte';
import { worldMaterial } from '../../gfx/materials';
import { itemGeometry } from '../../items/itemMeshes';
import { buildObjGeometry, objDef } from '../../world/objects';
import { species as getSpecies } from '../registry';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone, TileObject } from '../../world/zone';
import { CS, zoneOf, creatureMenu, poke, poked, pulse, stop, faceTo, floorItemsAround, takeFloorItem, dropStored, restoreStore } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, V3, Wt, buildKitRig, kitSync, kitPersonalize, flinchOf, hash, gauss } from '../kit/humanoids';
import { chain, sac, blade, paintCap } from '../kit/organic';
import { attachFilm, filmPersonalize, uprightDead } from '../kit/gel';
import { buildBee, poseBee } from './bumble_bee';
import { ruleShown } from '../rules';
import { remainsIn, objCentre } from '../../world/remains';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE QUEEN BEE — the mother of the Giant Bumble Bees, three metres of fur and
// fat sat in a bowl of comb at the back of the Ledge's Honey Pools. Her
// abdomen has grown so far past her wings that it rolled forward under her and
// split along the belly: the split never closed and became a mouth. It is an
// open stomach, a ribbed, wet, gaping maw at floor level with a ring of
// hooked plates round its lips, and it swallows anything that comes within
// reach of her raking front legs: things on the floor, furniture, animals,
// people. Where the fur has stretched bald over her flanks the skin has gone
// thin as a balloon's, and you can watch what she swallowed turning over
// inside her. The bees forage the remains of the backrooms and fly the meat
// home to her; fed, she lays brood into the comb.
// A swallowed unit is digested alive: struggle (the struggle QTE) to tear out
// through the lips, or have a partner cut you free. She cannot move.
//   queen_bee        skinned kit rig (abdomen shell with an open maw, ribbed throat,
//                    stomach lining, lips, barbs, thorax, head, six legs, ovipositor)
//                    + a translucent film (flank windows, honey drool, wings)
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildQueenBee(variant?)                             -> KitRig
//   poseQueenBee(rig, t, dt, pose, { gut?, variant? })  pose: 'idle' | 'gape' | 'suck' | 'gulp' |
//                                                        'churn' | 'lay' | 'spit' | 'fed' | 'dead'
//   gut: contents codes to show churning inside, e.g. ['i:flashlight', 'o:chair_office', 'b:1', 'c:tallow_pigeon']
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
/** model-space anchors (adult, facing +z) */
const MAW_Z = 0.62, MAW_Y = 0.6, MAW_RX = 0.56, MAW_RY = 0.42;
const ABD_Z0 = -1.62;

// ------------------------------------------------------------------ the abdomen's shape
/** profile at t (0 the rear pole .. 1 the maw rim): centre and radii */
function abdAt(t: number, v: number): { c: V3; ru: number; rv: number } {
  const fat = 1 + v * 0.05;
  const env = t < 0.46 ? 0.12 + 0.88 * Math.pow(Math.sin((t / 0.46) * Math.PI / 2), 0.62) : 1 - (1 - MAW_RX / 1.06) * Math.pow((t - 0.46) / 0.54, 1.7);
  const envV = t < 0.46 ? 0.12 + 0.88 * Math.pow(Math.sin((t / 0.46) * Math.PI / 2), 0.62) : 1 - (1 - MAW_RY / 0.86) * Math.pow((t - 0.46) / 0.54, 1.5);
  const z = ABD_Z0 + (MAW_Z - ABD_Z0) * t;
  const cy = 0.86 + 0.05 * gauss(t, 0.4, 0.2) - (0.86 - MAW_Y) * Math.pow(Math.max(0, (t - 0.55) / 0.45), 1.3);
  return { c: [0, cy, z], ru: 1.06 * env * (t < 0.98 ? fat : 1), rv: 0.86 * envV * (t < 0.98 ? fat : 1) };
}
const NA = 24, RA = 16;
/** the flank windows: where the fur stretched bald and the skin went thin as a membrane (ring band i, column j) */
function isWindow(i: number, j: number): boolean {
  return (i >= 6 && i <= 8 && (j === 5 || j === 6)) || (i >= 7 && i <= 9 && (j === 17 || j === 18)) || (i >= 3 && i <= 4 && (j === 8 || j === 16)) || (i >= 10 && i <= 11 && j === 15);
}

// ------------------------------------------------------------------ skeleton
function bonesQ(v: number): BoneSpec[] {
  const fat = 1 + v * 0.05;
  const A: [string, string, V3, boolean?][] = [
    ['base', '', [0, 0, 0]],
    ['abd', 'base', [0, 0.86, -0.4]],
    ['abdB', 'abd', [0, 0.82, -1.05]],
    ['abdF', 'abd', [0, 0.78, 0.2]],
    ['gut', 'abd', [0, 0.82, -0.45]],
    ['throat', 'abdF', [0, MAW_Y + 0.05, 0.2]],
    ['mawU', 'abdF', [0, MAW_Y + MAW_RY, MAW_Z]],
    ['mawD', 'abdF', [0, MAW_Y - MAW_RY, MAW_Z]],
    ['mawL', 'abdF', [MAW_RX, MAW_Y, MAW_Z]],
    ['mawR', 'abdF', [-MAW_RX, MAW_Y, MAW_Z]],
    ['ovi', 'abdB', [0, 0.62, ABD_Z0 + 0.12], true],
    ['ovi2', 'ovi', [0, 0.46, ABD_Z0 - 0.16]],
    ['thorax', 'base', [0, 1.6 * Math.min(1.04, fat), 0.24]],
    ['head', 'thorax', [0, 1.6, 0.72], true],
    ['tongue', 'head', [0, 1.36, 0.9]],
    ['mandL', 'head', [0.1, 1.42, 0.94]], ['mandR', 'head', [-0.1, 1.42, 0.94]],
    ['antAL', 'head', [0.09, 1.82, 0.88]], ['antBL', 'antAL', [0.14, 2.2, 1.0]],
    ['antAR', 'head', [-0.09, 1.82, 0.88]], ['antBR', 'antAR', [-0.14, 2.2, 1.0]],
    ['wFL', 'thorax', [0.2, 1.96, 0.32]], ['wHL', 'thorax', [0.19, 1.93, 0.12]],
    ['wFR', 'thorax', [-0.2, 1.96, 0.32]], ['wHR', 'thorax', [-0.19, 1.93, 0.12]],
  ];
  // the front pair reach down in front of the maw to rake; the middle and hind pairs hug her own belly
  const LEG: [V3, V3, V3][] = [
    [[0.26, 1.36, 0.5], [0.6, 1.2, 0.95], [0.6, 0.45, 1.15]],
    [[0.32, 1.36, 0.28], [0.8, 1.5, 0.3], [1.02, 1.05, 0.0]],
    [[0.3, 1.38, 0.06], [0.72, 1.56, -0.25], [1.0, 1.3, -0.75]],
  ];
  for (const [s, k] of SIDES) for (let i = 0; i < 3; i++) {
    const [a, b, c] = LEG[i];
    A.push([`l${i}a${s}`, 'thorax', [a[0] * k, a[1], a[2]], true], [`l${i}b${s}`, `l${i}a${s}`, [b[0] * k, b[1], b[2]]], [`l${i}c${s}`, `l${i}b${s}`, [c[0] * k, c[1], c[2]]]);
  }
  const abs = new Map<string, V3>();
  return A.map(([name, parent, p, cap]) => {
    abs.set(name, p);
    const q = parent ? abs.get(parent)! : [0, 0, 0];
    return { name, parent, at: [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cap };
  });
}
const LEG_TIP: V3[] = [[0.48, 0.03, 1.05], [0.98, 0.68, -0.3], [1.03, 0.86, -1.08]];

function layoutQ(p: Page) {
  p.reg('ABD', 128, 80); p.reg('THROAT', 64, 48); p.reg('THX', 48, 32); p.reg('HEAD', 48, 24); p.reg('LINING', 48, 32);
  p.reg('LIP', 64, 12); p.reg('LEG', 16, 64); p.reg('EYE', 24, 24); p.reg('OVI', 16, 32); p.reg('RIB', 16, 16); p.reg('MOUTH', 16, 16); p.reg('CAP', 8, 8);
}

/** fuzz: a jagged per-vertex radius noise, seamless around a loft */
const fuzz = (amp: number, n: number, rings: number, seed: number) => (a: number, t: number) => {
  const j = Math.round(((a + Math.PI) / (Math.PI * 2)) * n) % n, i = Math.round(t * rings);
  return (hash(j * 7 + i * 131, seed) - 0.5) * amp + (hash(j + 3, i * 17 + seed) < 0.12 ? amp * 0.7 : 0);
};

interface Ring { c: V3; ru: number; rv: number; v: number; w: (a: number) => Wt }
/** rings round the z axis (a = 0 on top, +pi/2 toward +x), with optional holes and inward-facing normals */
function ringLoft(B: SkinB, reg: Region, g: number, rings: Ring[], n: number, o: { bump?: (a: number, i: number) => number; skip?: (i: number, j: number) => boolean; flip?: boolean; start?: V3 | null; end?: V3 | null; k?: number } = {}) {
  const k0 = o.k ?? 1;
  const idx: number[][] = rings.map((r, i) => {
    const row: number[] = [];
    for (let j = 0; j <= n; j++) {
      const a = -Math.PI + (Math.PI * 2 * j) / n;
      const k = k0 * (1 + (o.bump ? o.bump(a, i) : 0));
      const p: V3 = [r.c[0] + Math.sin(a) * r.ru * k, r.c[1] + Math.cos(a) * r.rv * k, r.c[2]];
      // whatever reaches the floor flattens on it
      if (p[1] < 0.03) p[1] = 0.03 + (p[1] - 0.03) * 0.15;
      row.push(B.vert(p, reg.x + (j / n) * reg.w, reg.y + (1 - r.v) * reg.h, r.w(a), g));
    }
    return row;
  });
  for (let i = 0; i + 1 < rings.length; i++) {
    const ctr: V3 = [(rings[i].c[0] + rings[i + 1].c[0]) / 2, (rings[i].c[1] + rings[i + 1].c[1]) / 2, (rings[i].c[2] + rings[i + 1].c[2]) / 2];
    for (let j = 0; j < n; j++) {
      if (o.skip?.(i, j)) continue;
      const a = idx[i][j], b = idx[i][j + 1], c = idx[i + 1][j + 1], d = idx[i + 1][j];
      B.triOut(a, b, c, ctr, !!o.flip); B.triOut(a, c, d, ctr, !!o.flip);
    }
  }
  const pole = (P: V3, row: number[], r: Ring) => {
    const all: V3 = r.c;
    for (let j = 0; j < n; j++) {
      if (o.skip?.(-1, j)) continue;
      const pi = B.vert(P, reg.x + ((j + 0.5) / n) * reg.w, reg.y + (1 - r.v) * reg.h, r.w(-Math.PI + (Math.PI * 2 * (j + 0.5)) / n), g);
      const away: V3 = [all[0] * 2 - P[0], all[1] * 2 - P[1], all[2] * 2 - P[2]];
      B.triOut(pi, row[j], row[j + 1], away, !!o.flip);
    }
  };
  if (o.start) pole(o.start, idx[0], rings[0]);
  if (o.end) pole(o.end, idx[idx.length - 1], rings[rings.length - 1]);
  return idx;
}

/** weights of the abdomen surface at ring t, angle a: rear / middle / front, and the lips near the rim */
function abdW(x: BuildCtx, t: number, a: number): Wt {
  const bi = x.bi;
  const near = Math.max(0, (t - 0.8) / 0.2);
  if (near <= 0) return t < 0.3 ? [bi('abdB'), 1 - t / 0.3 * 0.5, bi('abd'), t / 0.3 * 0.5] : t < 0.6 ? [bi('abd'), 1] : [bi('abd'), 1 - (t - 0.6) / 0.2, bi('abdF'), (t - 0.6) / 0.2];
  return [bi('abdF'), 1 - near * 0.85, ...lipW(x, a, near * 0.85)];
}
function lipW(x: BuildCtx, a: number, k = 1): Wt {
  const bi = x.bi, ca = Math.cos(a), sa = Math.sin(a);
  const u = Math.max(0, ca) ** 2, d = Math.max(0, -ca) ** 2, l = Math.max(0, sa) ** 2, r = Math.max(0, -sa) ** 2;
  // the two strongest lips
  const all: [number, number][] = [[bi('mawU'), u], [bi('mawD'), d], [bi('mawL'), l], [bi('mawR'), r]];
  all.sort((p, q) => q[1] - p[1]);
  const s = all[0][1] + all[1][1] || 1;
  return [all[0][0], (all[0][1] / s) * k, all[1][0], (all[1][1] / s) * k];
}

function buildQ(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, v = x.variant;
  // ---- the abdomen: a vast egg of banded fur, open at the front, bald windows in the flanks
  const fA = fuzz(0.12, NA, RA, 3 + v);
  const rings: Ring[] = [];
  for (let i = 0; i < RA; i++) {
    const t = i / (RA - 1), s = abdAt(t, v);
    rings.push({ c: s.c, ru: s.ru, rv: s.rv, v: t, w: (a) => abdW(x, t, a) });
  }
  ringLoft(B, R('ABD'), 1, rings, NA, {
    // fur everywhere but round the maw and on the windows, the fat folds between segments
    bump: (a, i) => { const t = i / (RA - 1); const bald = t > 0.88 ? 0 : 1; return fA(a, t) * bald + Math.cos(t * Math.PI * 2 * 4.5) * 0.025 * bald - (Math.abs(a) > 2.5 ? 0.05 : 0); },
    skip: (i, j) => isWindow(i, j), start: [0, 0.7, ABD_Z0 - 0.08],
  });
  // ---- the stomach lining: a closed sac inside, wet folds, seen through the windows and down the throat
  const lin: Ring[] = [];
  for (let i = 0; i < 12; i++) {
    const t = 0.05 + (i / 11) * 0.82, s = abdAt(t, v);
    lin.push({ c: [s.c[0], s.c[1] + 0.02, s.c[2]], ru: s.ru * 0.86, rv: s.rv * 0.84, v: i / 11, w: (a) => abdW(x, t * 0.9, a) });
  }
  ringLoft(B, R('LINING'), 2, lin, 18, { flip: true, bump: (a, i) => 0.05 * Math.sin(a * 5 + i * 1.7) + 0.03 * Math.sin(i * 2.3), start: [0, 0.75, ABD_Z0 + 0.1], end: [0, 0.7, 0.42] });
  // ---- the throat: from the rim inward, narrowing, ribbed in rings
  const th: Ring[] = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8, z = MAW_Z - 0.02 - t * 0.66;
    const k = 1 - 0.42 * Math.pow(t, 0.8);
    th.push({ c: [0, MAW_Y + 0.05 * t, z], ru: MAW_RX * 0.97 * k, rv: MAW_RY * 0.97 * k, v: 1 - t, w: (a) => (t < 0.3 ? [...lipW(x, a, 1 - t / 0.3), bi('throat'), t / 0.3] : [bi('throat'), 1 - (t - 0.3) * 0.6, bi('abdF'), (t - 0.3) * 0.6]) });
  }
  ringLoft(B, R('THROAT'), 3, th, 20, { flip: true, bump: (a, i) => (i % 2 ? 0.07 : -0.03) + 0.03 * Math.sin(a * 6 + i) });
  // ---- the lips: a fat wet roll round the rim, ribbed with chitin plates, hooked barbs on the inside
  const NL = 28, lipPts: V3[] = [], lipWts: Wt[] = [];
  for (let k = 0; k <= NL; k++) {
    const a = -Math.PI + (Math.PI * 2 * k) / NL;
    lipPts.push([Math.sin(a) * (MAW_RX + 0.03), MAW_Y + Math.cos(a) * (MAW_RY + 0.03), MAW_Z + 0.01]);
    lipWts.push(lipW(x, a));
  }
  sac(B, R('LIP'), 4, lipPts, lipPts.map((_, k) => [0.07 + 0.015 * Math.sin(k * 1.9), 0.06] as [number, number]), lipWts, { n: 8, start: false, end: false, up: [0, 0, 1], bump: (a, t) => 0.12 * Math.sin(t * NL * Math.PI) * Math.max(0, Math.cos(a)) });
  for (let k = 0; k < 14; k++) {
    const a = -Math.PI + (Math.PI * 2 * (k + 0.5)) / 14;
    const sa = Math.sin(a), ca = Math.cos(a), w = lipW(x, a);
    // a rib: a chitin plate arching over the lip from the outside in
    const out: V3 = [sa * (MAW_RX + 0.2), MAW_Y + ca * (MAW_RY + 0.18), MAW_Z - 0.16];
    const top: V3 = [sa * (MAW_RX + 0.1), MAW_Y + ca * (MAW_RY + 0.1), MAW_Z + 0.07];
    const inn: V3 = [sa * (MAW_RX - 0.04), MAW_Y + ca * (MAW_RY - 0.04), MAW_Z - 0.02];
    sac(B, R('RIB'), 5, [out, top, inn], [[0.035, 0.02], [0.04, 0.025], [0.02, 0.012]], [w, w, w], { n: 6 });
    // a barb: a hooked plate pointing into the throat
    const b0: V3 = [sa * (MAW_RX - 0.05), MAW_Y + ca * (MAW_RY - 0.05), MAW_Z - 0.04];
    const b1: V3 = [sa * (MAW_RX - 0.16), MAW_Y + ca * (MAW_RY - 0.14), MAW_Z - 0.1];
    const b2: V3 = [sa * (MAW_RX - 0.2), MAW_Y + ca * (MAW_RY - 0.19), MAW_Z - 0.2];
    sac(B, R('MOUTH'), 6, [b0, b1, b2], [[0.025, 0.018], [0.014, 0.01], [0.003, 0.003]], [w, w, w], { n: 5 });
  }
  // ---- the ovipositor: a soft, ringed tube tucked under the rear pole
  chain(B, x, R('OVI'), 7, { bones: ['ovi', 'ovi2'], tip: [0, 0.32, ABD_Z0 - 0.34], r: (t) => 0.09 - t * 0.065, n: 8, rings: 4, bump: (a, t) => 0.08 * Math.sin(t * 30) });
  // ---- the thorax: a fuzzy ball with a thick collar, perched on the front of the abdomen
  const T = x.rest('thorax'), H = x.rest('head');
  const wT: Wt = [bi('thorax'), 1], wH: Wt = [bi('head'), 1];
  const fT = fuzz(0.2, 20, 6, 11 + v);
  sac(B, R('THX'), 8, [[T[0], T[1] - 0.02, T[2] - 0.36], [T[0], T[1], T[2] - 0.2], [T[0], T[1] + 0.03, T[2] + 0.04], [T[0], T[1], T[2] + 0.3], [T[0], T[1] - 0.04, T[2] + 0.44]],
    [[0.22, 0.2], [0.4, 0.38], [0.45, 0.44], [0.36, 0.35], [0.16, 0.16]], [wT, wT, wT, wT, wT], { n: 20, bump: fT });
  // ---- the head: broad, heavy-jawed, two great kidney eyes and three ocelli
  const fH = fuzz(0.12, 16, 5, 21 + v);
  sac(B, R('HEAD'), 9, [[H[0], H[1] + 0.03, H[2] - 0.1], [H[0], H[1] + 0.02, H[2] + 0.02], [H[0], H[1] - 0.03, H[2] + 0.16], [H[0], H[1] - 0.12, H[2] + 0.26], [H[0], H[1] - 0.2, H[2] + 0.3]],
    [[0.16, 0.16], [0.24, 0.25], [0.23, 0.26], [0.17, 0.19], [0.08, 0.08]], [wH, wH, wH, wH, wH], { n: 16, bump: fH });
  for (const [s, k] of SIDES) {
    const e: V3 = [H[0] + k * 0.18, H[1] - 0.02, H[2] + 0.13];
    sac(B, R('EYE'), 10, [[e[0] - k * 0.015, e[1] + 0.02, e[2] - 0.13], [e[0], e[1], e[2]], [e[0] - k * 0.025, e[1] - 0.04, e[2] + 0.13]], [[0.03, 0.08], [0.075, 0.15], [0.03, 0.08]], [wH, wH, wH], { n: 12, up: [0, 1, 0] });
    chain(B, x, R('LEG'), 11, { bones: ['antA' + s, 'antB' + s], tip: [k * 0.2, 2.2, 1.4], r: [0.022, 0.012], n: 5, rings: 4, knuckle: 0.4 });
    const m = x.rest('mand' + s);
    sac(B, R('MOUTH'), 12, [m, [m[0] - k * 0.03, m[1] - 0.04, m[2] + 0.05], [m[0] - k * 0.08, m[1] - 0.06, m[2] + 0.04]], [[0.03, 0.022], [0.022, 0.016], [0.005, 0.005]], [[bi('mand' + s), 1], [bi('mand' + s), 1], [bi('mand' + s), 1]], { n: 6 });
    // ---- legs: thick, bristled, hooked at the foot
    for (let i = 0; i < 3; i++) {
      const L = (q: string) => `l${i}${q}${s}`;
      const tip = LEG_TIP[i];
      chain(B, x, R('LEG'), 13, { bones: [L('a'), L('b'), L('c')], tip: [tip[0] * k, tip[1], tip[2]], r: (t) => (i === 2 && t > 0.45 && t < 0.8 ? 0.12 : 0.1 - t * 0.055) * (t < 0.12 ? 1.25 : 1), flat: i === 2 ? 0.65 : 0.85,
        n: 8, rings: 3, knuckle: 0.4, bump: (a, t) => (hash(Math.round(a * 4), Math.round(t * 30)) - 0.5) * 0.6 });
      // the foot: a hooked claw pair
      const tp: V3 = [tip[0] * k, tip[1], tip[2]];
      for (const h of [-1, 1]) sac(B, R('MOUTH'), 16, [tp, [tp[0] + h * 0.03, tp[1] + 0.01, tp[2] + 0.06], [tp[0] + h * 0.05, tp[1] - 0.02, tp[2] + 0.1]], [[0.02, 0.02], [0.014, 0.014], [0.003, 0.003]], [[bi(L('c')), 1], [bi(L('c')), 1], [bi(L('c')), 1]], { n: 5 });
    }
  }
  for (const k of [-1, 0, 1]) sac(B, R('EYE'), 14, [[k * 0.07, H[1] + 0.2, H[2] + 0.02 - Math.abs(k) * 0.03], [k * 0.07, H[1] + 0.23, H[2] + 0.04 - Math.abs(k) * 0.03]], [[0.025, 0.025], [0.006, 0.006]], [wH, wH], { n: 6 });
  const tg = x.rest('tongue');
  sac(B, R('MOUTH'), 15, [tg, [tg[0], tg[1] - 0.04, tg[2] - 0.08], [tg[0], tg[1] - 0.06, tg[2] - 0.2]], [[0.025, 0.02], [0.018, 0.015], [0.008, 0.008]], [[bi('tongue'), 1], [bi('tongue'), 1], [bi('tongue'), 1]], { n: 6 });
}

// ------------------------------------------------------------------ paint
const PAL = { y: 0xc0740c, k: 0x141010, w: 0xe8d8b8, skin: 0xb07a72, flesh: 0xa83a3a };
function paintQ(p: Page, x: BuildCtx) {
  const v = x.variant;
  const Y = makeRamp(mixHex(PAL.y, 0xc87a14, v * 0.5), 7, { hueShift: 0.06, spread: 0.42, satShift: 0.15 }), K = makeRamp(PAL.k, 6, { spread: 0.22 }), Wh = makeRamp(PAL.w, 6, { spread: 0.35 });
  const S = makeRamp(PAL.skin, 6, { spread: 0.4, hueShift: -0.02 });
  // the abdomen: bands from the tail (bottom rows) to the maw (top rows); bald, veined skin round the
  // mouth and over the windows, pale stretch marks round them
  const ab = p.R('ABD');
  const band = (t: number) => (t > 0.9 ? 's' : t > 0.72 ? 'y' : t > 0.56 ? 'k' : t > 0.44 ? 'y' : t > 0.27 ? 'k' : t > 0.12 ? 'y' : 'w');
  for (let yy = 0; yy < ab.h; yy++) for (let xx = 0; xx < ab.w; xx++) {
    const t = 1 - (yy + 0.5) / ab.h + (hash(xx * 7, yy) - 0.5) * 0.03;
    const i = t * (RA - 1), j = ((xx + 0.5) / ab.w) * NA;
    // distance (in cells) to the nearest window
    let wd = 9;
    for (let ii = 0; ii < RA - 1; ii++) for (let jj = 0; jj < NA; jj++) if (isWindow(ii, jj)) wd = Math.min(wd, Math.max(0, Math.abs(i - (ii + 0.5)) - 0.5, Math.abs(j - (jj + 0.5)) - 0.5));
    const key = wd < 0.6 ? 's' : band(Math.max(0, Math.min(0.999, t)));
    const th = (ab.deg(xx) * Math.PI) / 180;
    if (key === 's') {
      ab.put(xx, yy, S, 3 + Math.cos(th) * 0.5 + (ab.fbm(xx, yy, 4, 2, 8) - 0.5) * 1.6 - (Math.abs(th) > 2.4 ? 1 : 0), 0.4);
      continue;
    }
    const RR = key === 'y' ? Y : key === 'k' ? K : Wh;
    const cell = (yy + Math.floor(hash(xx, 9) * 4)) % 4;
    // thinning fur toward the windows: the skin shows through
    const thin = wd < 1.1 ? (1.1 - wd) / 0.6 : 0;
    if (thin > 0 && hash(xx * 3, yy * 5) < thin * 0.6) { ab.put(xx, yy, S, 2.5 + (hash(xx, yy) - 0.5), 0.4); continue; }
    ab.put(xx, yy, RR, RR.length * 0.3 + 0.4 * Math.cos(th) - 0.3 + cell * 0.2 + (hash(xx * 3, yy * 5) - 0.5) * 0.7 + (ab.fbm(xx, yy, 3, 2, 4) - 0.5) * 0.6 - (Math.abs(th) > 2.3 ? 0.8 : 0), 0.45);
  }
  // veins over the bald skin, stretch marks, fat creases between the bands
  for (let k = 0; k < 18; k++) ab.crack(hash(k, 1) * ab.w, hash(k, 2) * ab.h * 0.4, 14, 90 + hash(k, 3) * 60, 0x6a3a5a, k + 7, 0.45, 0.2);
  for (let s = 1; s < 7; s++) { const yy = Math.round((s / 7) * ab.h); for (let xx = 0; xx < ab.w; xx++) if (hash(xx, s) < 0.7) ab.blend(xx, yy, 0x0c0a08, 0.4); }
  for (let k = 0; k < 40; k++) { const xx = hash(k, 11) * ab.w, yy = hash(k, 12) * ab.h; ab.line(xx, yy, xx + 3, yy + 1, 0xf0d8d0, 0.35); }
  // the wet honey that has run out of the corners of the maw, down the front
  for (let k = 0; k < 9; k++) { const xx = ab.w * (0.5 + (hash(k, 21) - 0.5) * 0.5); for (let yy = 0; yy < 6 + hash(k, 22) * 12; yy++) ab.blend(xx + Math.sin(yy * 0.5) * 0.6, yy, 0xe8a030, 0.55); }
  // the throat: wet pink-red rings going dark deeper in, glints
  const th = p.R('THROAT');
  const TR = makeRamp(0xc0505a, 7, { spread: 0.55, hueShift: -0.03 });
  th.fill(TR, (xx, yy) => { const t = yy / th.h; return 4.2 - t * 3.6 + Math.cos((yy / th.h) * Math.PI * 16) * 0.8 + (th.fbm(xx, yy, 4, 2, 31) - 0.5) * 1.2; }, undefined, 0.5);
  for (let i = 0; i < 40; i++) th.blend(hash(i, 1) * th.w, hash(i, 2) * th.h * 0.7, 0xfff0f0, 0.75);
  for (let k = 0; k < 12; k++) th.vline(hash(k, 5) * th.w, 0, th.h * (0.4 + hash(k, 6) * 0.6), 0x6a1a2a, 0.35);
  // the lining: deep red rugae (folds), darker in the creases
  const li = p.R('LINING');
  li.fill(makeRamp(0x8a2a30, 6, { spread: 0.5 }), (xx, yy) => 2.6 + Math.sin(xx * 0.55 + Math.sin(yy * 0.3) * 2) * 1.2 + (li.fbm(xx, yy, 3, 2, 41) - 0.5), undefined, 0.5);
  for (let i = 0; i < 20; i++) li.blend(hash(i, 3) * li.w, hash(i, 4) * li.h, 0xffd8d0, 0.6);
  // the lips: glistening, ridged, with a dark crease along the inner edge
  const lp = p.R('LIP');
  lp.fill(makeRamp(0xc85a5a, 6, { spread: 0.45 }), (xx, yy) => 3 + Math.sin(xx * 0.9) * 0.6 - (yy > lp.h * 0.7 ? 1.4 : 0) + (hash(xx, yy) - 0.5) * 0.8, undefined, 0.5);
  for (let i = 0; i < 24; i++) lp.blend(hash(i, 7) * lp.w, hash(i, 8) * lp.h * 0.5, 0xfff4f0, 0.8);
  // chitin: ribs, barbs, mandibles, tongue
  p.R('RIB').fill(makeRamp(0x6a4a24, 6, { spread: 0.5 }), (xx, yy) => 2.5 + (yy < 5 ? 1.5 : 0) + (hash(xx, yy) - 0.5) * 1.2);
  p.R('MOUTH').fill(makeRamp(0x3a2414, 5, { spread: 0.5 }), (xx, yy) => 2 + (hash(xx, yy) - 0.5) * 1.2 + (yy < 4 ? 1 : 0));
  // the ovipositor: pale, segmented, faintly translucent-looking
  const ov = p.R('OVI');
  ov.fill(makeRamp(0xe0c0a8, 6, { spread: 0.4 }), (xx, yy) => 3 + ((yy % 4) === 0 ? -1.5 : 0) + Math.cos((ov.deg(xx) * Math.PI) / 180) * 0.6);
  // thorax, head, eyes, legs (the bee's look, bigger, darker, a gold crown)
  const tx = p.R('THX');
  for (let yy = 0; yy < tx.h; yy++) for (let xx = 0; xx < tx.w; xx++) {
    const f = (yy + (hash(xx * 5, yy) - 0.5) * 3) / tx.h;
    const top = Math.abs(tx.deg(xx)) < 70;
    const RR = f > 0.62 ? Y : f > 0.3 && top ? K : f < 0.2 ? Y : top ? K : Y;
    const a = (tx.deg(xx) * Math.PI) / 180;
    tx.put(xx, yy, RR, RR.length * 0.3 + 0.4 * Math.cos(a) - 0.3 + ((yy + Math.floor(hash(xx, 4) * 3)) % 3) * 0.22 + (hash(xx * 3, yy * 7) - 0.5) * 0.8, 0.45);
  }
  const hd = p.R('HEAD');
  hd.fill(K, (xx, yy) => K.length * 0.5 + 0.5 * Math.cos((hd.deg(xx) * Math.PI) / 180) - 0.3 + ((yy + Math.floor(hash(xx, 7) * 4)) % 4) * 0.2 + (hash(xx * 3, yy * 5) - 0.5) * 0.7, undefined, 0.6);
  for (let i = 0; i < 50; i++) hd.blend(hd.w / 2 + (hash(i, 1) - 0.5) * 18, hash(i, 2) * hd.h * 0.4, 0xe8b030, 0.65);
  const ey = p.R('EYE');
  ey.fill(makeRamp(0x14161c, 5, { spread: 0.6 }), (xx, yy) => 1.4 + ((xx + (yy & 1)) % 2) * 0.4 + (Math.abs(ey.deg(xx)) < 40 && yy > 5 && yy < 11 ? 2.4 : 0) + (hash(xx, yy) - 0.5) * 0.6, undefined, 0.4);
  ey.set(9, 6, 0xffffff); ey.set(10, 6, 0xc8d0e0); ey.set(13, 8, 0x8890a8);
  const lg = p.R('LEG');
  lg.fill(makeRamp(0x2a2018, 5), (xx, yy) => 2 + (yy % 3 === 0 ? -0.8 : 0) + (hash(xx, yy) - 0.5) * 1.4 + Math.cos((lg.deg(xx) * Math.PI) / 180) * 0.6);
  paintCap(p.R('CAP'), PAL.y, 0xe8b0a0, 0x8a3a2a);
}
const QUEEN_KIT_V = 2;

// ------------------------------------------------------------------ the film: flank windows, drool, wings
function layoutF(p: Page) { p.reg('MEMB', 32, 32); p.reg('DROOL', 16, 32); p.reg('WING', 32, 16); p.reg('CAP', 8, 8); }
function buildF(B: SkinB, x: BuildCtx) {
  const v = x.variant;
  // the windows: the abdomen surface again, only where the shell has holes, sunk a little (stretched)
  const rings: Ring[] = [];
  for (let i = 0; i < RA; i++) { const t = i / (RA - 1), s = abdAt(t, v); rings.push({ c: s.c, ru: s.ru, rv: s.rv, v: t, w: (a) => abdW(x, t, a) }); }
  ringLoft(B, x.R('MEMB'), 1, rings, NA, { k: 0.975, skip: (i, j) => !isWindow(i, j), bump: (a, i) => 0.02 * Math.sin(a * 9 + i * 3) });
  // honey drool: strands from the upper lip to the lower, stretching as the maw opens
  for (let k = 0; k < 5; k++) {
    const xx = (k - 2) * 0.2 + (hash(k, v) - 0.5) * 0.06, zz = MAW_Z - 0.06 - (k % 2) * 0.08;
    const top: V3 = [xx, MAW_Y + MAW_RY * Math.sqrt(Math.max(0.05, 1 - (xx / MAW_RX) ** 2)) - 0.02, zz];
    const bot: V3 = [xx * 0.9, MAW_Y - MAW_RY * Math.sqrt(Math.max(0.05, 1 - (xx / MAW_RX) ** 2)) + 0.03, zz];
    const pts: V3[] = [0, 0.25, 0.5, 0.75, 1].map((t) => [top[0] + (bot[0] - top[0]) * t, top[1] + (bot[1] - top[1]) * t, top[2] - Math.sin(t * Math.PI) * 0.05]);
    const ws: Wt[] = [0, 0.25, 0.5, 0.75, 1].map((t) => [x.bi('mawU'), 1 - t, x.bi('mawD'), t]);
    sac(B, x.R('DROOL'), 2 + k, pts, pts.map((_, i) => { const r = i === 2 ? 0.008 : i === 0 || i === 4 ? 0.018 : 0.011; return [r, r] as [number, number]; }), ws, { n: 5 });
  }
  // four wings, far too small for her: smoky, veined
  for (const [s, k] of SIDES) for (const [w, L, Wd] of [['wF', 0.6, 0.17], ['wH', 0.42, 0.12]] as const) {
    const r = x.rest(w + s), id = x.bi(w + s);
    const pts: V3[] = [0, 0.3, 0.6, 0.85, 1].map((t) => [r[0] + k * L * t * 0.7, r[1] + 0.04 * Math.sin(t * Math.PI), r[2] - L * 0.7 * t]);
    blade(B, x.R('WING'), pts, [Wd * 0.25, Wd * 0.8, Wd, Wd * 0.8, Wd * 0.1], [0, 0, -1], pts.map(() => [id, 1]), { offset: -0.35, edge: 0.15, seed: k + 5 });
  }
}
function paintF(p: Page) {
  const m = p.R('MEMB');
  // stretched skin, thin enough to see through: amber-pink, veined, darker where it is thickest
  m.fill(makeRamp(0xe8a890, 6, { spread: 0.45 }), (xx, yy) => 3 + (m.fbm(xx, yy, 3, 2, 51) - 0.5) * 1.4, undefined, 0.5);
  for (let k = 0; k < 9; k++) m.crack(hash(k, 1) * m.w, hash(k, 2) * m.h, 22, hash(k, 3) * 360, 0x8a2a3a, k + 3, 0.8, 0.3);
  const d = p.R('DROOL');
  d.fill(makeRamp(0xe8a838, 5, { spread: 0.4 }), (xx, yy) => 3 + (hash(xx, yy) - 0.5) * 0.8 + (xx === 3 ? 1.5 : 0));
  const r = p.R('WING');
  r.fill(makeRamp(0xc0b8a8, 5, { spread: 0.4 }), (xx, yy) => 2.6 + (r.fbm(xx, yy, 2, 2, 3) - 0.5) * 1.2 - (yy / r.h) * 0.8);
  for (let i = 0; i < 5; i++) r.line(0, r.h * (0.2 + i * 0.15), r.w, r.h * (0.1 + i * 0.2), 0x3a3020, 0.7);
  for (let i = 0; i < 4; i++) r.line(r.w * (0.3 + i * 0.15), 0, r.w * (0.35 + i * 0.15), r.h, 0x4a4030, 0.5);
  paintCap(p.R('CAP'), 0xe8a890, 0xd88a7a, 0x8a3a3a);
}
const FILM_KIT: KitDef = { key: 'queen_bee_film', variants: QUEEN_KIT_V, W: 128, H: 64, bones: bonesQ, layout: layoutF, build: buildF, paint: paintF, sphere: [0, 1.0, -0.4, 2.0] };
export const QUEEN_KIT: KitDef = { key: 'queen_bee', variants: QUEEN_KIT_V, W: 256, H: 256, bones: bonesQ, layout: layoutQ, build: buildQ, paint: paintQ, sphere: [0, 1.0, -0.4, 2.0],
  decorate: (rig, e) => { attachFilm(rig, FILM_KIT, e.variant, { opacity: 0.42, edge: 1.5, spec: 1.3, rim: 0.4, doubleSide: true }); } };

/** a queen rig (stand-alone) */
export function buildQueenBee(variant = 0): KitRig { return buildKitRig(QUEEN_KIT, variant, 1.75); }

// ------------------------------------------------------------------ what is inside her
/** gut codes: 'i:<item>' 'o:<object>' 'b:<bee variant>' 'c:<species>' (+ '@<time swallowed>' in game) */
const GUT_MAT = (() => { let m: THREE.Material | null = null; return () => (m ??= worldMaterial({})); })();
interface GutThing { code: string; obj: THREE.Object3D; rig?: KitRig; seed: number }
function gutThing(code: string): GutThing | null {
  const kind = code[0], key = code.slice(2).split('@')[0];
  const seed = hash(code.length * 13 + code.charCodeAt(code.length - 1), 7);
  try {
    if (kind === 'i') {
      const g = itemGeometry(key); if (!g) return null;
      const m = new THREE.Mesh(g, GUT_MAT()); m.scale.setScalar(2.4);
      const o = new THREE.Group(); o.add(m); return { code, obj: o, seed };
    }
    if (kind === 'o') {
      const g = buildObjGeometry(key); if (!g) return null;
      g.computeBoundingSphere();
      const bs = g.boundingSphere!;
      const m = new THREE.Mesh(g, GUT_MAT());
      const s = Math.min(0.9, 0.34 / Math.max(0.05, bs.radius));
      m.position.set(-bs.center.x * s, -bs.center.y * s, -bs.center.z * s); m.scale.setScalar(s);
      const o = new THREE.Group(); o.add(m); return { code, obj: o, seed };
    }
    if (kind === 'b') { const rig = buildBee(Number(key) || 0); rig.root.scale.setScalar(0.62); return { code, obj: rig.root, rig, seed }; }
    if (kind === 'c') {
      const sp: any = getSpecies(key); if (!sp) return null;
      const rig = sp.build() as KitRig;
      if (!rig?.kit) return null;
      const s = Math.min(0.7, 0.55 / Math.max(0.3, (sp.height ?? 1)));
      rig.root.scale.setScalar(s);
      return { code, obj: rig.root, rig, seed };
    }
  } catch (e) { console.warn('queen gut', code, e); }
  return null;
}
/** keep the proxies inside her in step with the codes; dig: digestion 0..1 per code */
function syncGut(K: KitRig, codes: string[], dig: (code: string) => number, t: number, dt: number) {
  const m = K.kit.m as { gut?: GutThing[] };
  const list = (m.gut ??= []);
  for (let i = list.length - 1; i >= 0; i--) if (!codes.includes(list[i].code)) { list[i].obj.removeFromParent(); list.splice(i, 1); }
  for (const c of codes) if (!list.some((g) => g.code === c)) { const g = gutThing(c); if (g) { K.parts.gut.add(g.obj); list.push(g); } }
  list.forEach((g, i) => {
    const p = Math.max(0, Math.min(1, dig(g.code)));
    // churning: each thing turns over slowly on its own loop, sinking toward the back as it goes
    const a = t * (0.25 + g.seed * 0.2) + i * 2.1, b = t * (0.33 + g.seed * 0.15) + i;
    g.obj.position.set(Math.sin(a) * 0.32 * (1 - p * 0.4), -0.12 + Math.cos(b) * 0.2 - p * 0.15, 0.25 - (i % 3) * 0.3 + Math.sin(a * 0.7) * 0.18 - p * 0.3);
    g.obj.rotation.set(a * 0.8 + g.seed * 5, b * 0.6, Math.sin(a) * 0.9);
    const base = g.rig ? (g.code[0] === 'b' ? 0.62 : g.obj.userData.s0 ??= g.obj.scale.x) : g.obj.userData.s0 ??= g.obj.scale.x;
    g.obj.scale.setScalar(base * (1 - p * 0.55));
    if (g.rig) {
      kitSync(g.rig);
      if (g.code[0] === 'b') poseBee(g.rig, { t, dt, fly: 1, panic: p < 0.1 ? 1 : 0, bonk: 0, bonkSide: 1, dead: Math.min(1, p * 2) * 0.4, seed: g.seed, flinch: 0, speed: 0, still: Math.min(1, p * 3) });
      g.rig.kit.F.fx.value.w = Math.min(0.92, Math.max(0, (p - 0.3) / 0.7));
      g.rig.kit.F.tint.value.set(1, 0.6, 0.35, Math.min(0.8, p + 0.15));
    }
  });
}

// ------------------------------------------------------------------ animation
export interface QueenDrive {
  t: number; dt: number; seed: number;
  /** maw: gape 0 shut .. 1 wide; suck the inhale before a swallow; gulp a fresh swallow (decays); spit a convulsion */
  gape: number; suck: number; gulp: number; spit: number;
  /** digesting (the abdomen churns), laying (the rear lifts, the ovipositor works), being fed by a bee */
  churn: number; lay: number; fed: number;
  /** head yaw toward what she is looking at (-1..1), front legs raking (0..1), struggling contents */
  look: number; rake: number; kick: number;
  dead: number; flinch: number;
}
const p0 = (o: THREE.Object3D) => o.userData.p0 as THREE.Vector3;
function poseQueen(K: KitRig, d: QueenDrive) {
  const P = K.parts, t = d.t, s7 = d.seed * 7, live = 1 - d.dead;
  const base = P.base; base.rotation.set(0, 0, 0); base.position.set(0, 0, 0);
  // breathing: the whole abdomen heaves, slowly; faster when she inhales or digests
  const br = Math.sin(t * (0.9 + d.churn * 0.5 + d.suck * 2.5) + s7) * live;
  const sq = 1 - d.dead * 0.2;
  P.abd.scale.set(1 + br * 0.018 + d.gulp * 0.05 - d.spit * 0.04, (1 + br * 0.026 + d.gulp * 0.04 - d.spit * 0.05) * sq, 1 + br * 0.012);
  P.abd.position.set(p0(P.abd).x, p0(P.abd).y - d.dead * 0.12, p0(P.abd).z);
  // churning: front and rear of the belly roll against each other
  const ch = d.churn * live;
  P.abdB.rotation.set(Math.sin(t * 0.7 + s7) * 0.04 * ch - d.lay * 0.22 + Math.sin(t * 3) * 0.03 * d.lay, Math.sin(t * 0.5) * 0.05 * ch, Math.sin(t * 0.9 + 1) * 0.04 * ch);
  P.abdB.scale.set(1 + Math.sin(t * 1.1) * 0.03 * ch, 1 + Math.sin(t * 1.3 + 2) * 0.04 * ch + d.lay * 0.04, 1);
  P.abdF.rotation.set(Math.sin(t * 0.8 + 2) * 0.03 * ch + d.spit * 0.08 + d.suck * 0.05, Math.sin(t * 0.6 + 1) * 0.04 * ch, 0);
  P.abdF.scale.set(1 + d.suck * 0.04 + Math.sin(t * 9) * 0.02 * d.kick, 1 + d.suck * 0.05 + Math.sin(t * 11) * 0.025 * d.kick, 1);
  P.gut.rotation.set(Math.sin(t * 0.3) * 0.2 * ch, t * 0.05 * ch, Math.cos(t * 0.27) * 0.15 * ch);
  // the maw: a slow wet breathing gape at rest; wide and quivering when she inhales; snapped shut on a swallow
  const rest = 0.18 + 0.08 * Math.sin(t * 0.9 + s7);
  const open = Math.max(-0.35, (rest * live + d.gape * 0.8 + d.suck * 1.05 + d.spit * 0.9 + d.fed * 0.35) * (1 - d.gulp * 0.95) - d.gulp * 0.3 + d.dead * 0.55);
  const quiver = (Math.sin(t * 31) * 0.5 + Math.sin(t * 47) * 0.5) * (d.suck * 0.025 + d.spit * 0.03) * live;
  const U = P.mawU, D = P.mawD, L = P.mawL, Rr = P.mawR;
  U.position.set(p0(U).x, p0(U).y + open * 0.24 + quiver, p0(U).z + open * 0.05);
  D.position.set(p0(D).x, p0(D).y - open * 0.13 - quiver, p0(D).z + open * 0.06);
  L.position.set(p0(L).x + open * 0.14 + quiver, p0(L).y, p0(L).z + open * 0.04);
  Rr.position.set(p0(Rr).x - open * 0.14 - quiver, p0(Rr).y, p0(Rr).z + open * 0.04);
  U.rotation.set(-open * 0.35, 0, 0); D.rotation.set(open * 0.3, 0, 0);
  L.rotation.set(0, open * 0.3, 0); Rr.rotation.set(0, -open * 0.3, 0);
  // the throat: a peristaltic ring travelling inward (fast on a swallow, slow while digesting)
  const per = Math.sin(t * (1.2 + d.gulp * 8 + d.suck * 3) - s7);
  P.throat.scale.set(1 + per * 0.06 * live + d.suck * 0.12 - d.gulp * 0.2, 1 + per * 0.08 * live + d.suck * 0.15 - d.gulp * 0.22, 1);
  P.throat.position.set(p0(P.throat).x, p0(P.throat).y, p0(P.throat).z - d.suck * 0.08 - d.gulp * 0.15);
  // the ovipositor: tucked; laying, it pushes out and pulses
  P.ovi.rotation.set(0.5 * (1 - d.lay) - d.lay * 0.3 + Math.sin(t * 2.6) * 0.15 * d.lay, 0, Math.sin(t * 1.3) * 0.06 * d.lay);
  P.ovi.position.set(p0(P.ovi).x, p0(P.ovi).y - d.lay * 0.08, p0(P.ovi).z - d.lay * 0.12);
  P.ovi2.scale.set(1 + Math.max(0, Math.sin(t * 2.6)) * 0.25 * d.lay, 1 + d.lay * 0.4, 1 + Math.max(0, Math.sin(t * 2.6)) * 0.25 * d.lay);
  P.ovi2.rotation.set(0.3 * (1 - d.lay) + d.lay * 0.4, 0, 0);
  // thorax and head: perched, swaying with her breath, hunched over the maw when she feeds or inhales
  const th = P.thorax;
  th.position.set(p0(th).x, p0(th).y + br * 0.02 - d.dead * 0.25 + d.gulp * 0.04, p0(th).z - d.gulp * 0.05);
  th.rotation.set(0.08 * d.suck + 0.1 * d.fed - d.gulp * 0.12 + d.spit * 0.18 + d.dead * 0.3 + Math.sin(t * 0.5 + s7) * 0.03 * live, d.look * 0.18, Math.sin(t * 0.37 + s7) * 0.03 * live + d.dead * 0.2);
  if (d.flinch > 0) th.position.x += Math.sin(t * 70) * 0.04 * d.flinch;
  P.head.rotation.set(0.25 * d.suck + 0.35 * d.fed - 0.25 * d.gulp + 0.3 * d.spit + Math.sin(t * 1.1 + s7) * 0.05 * live + d.dead * 0.5, d.look * 0.45 + Math.sin(t * 0.6 + s7) * 0.1 * live, Math.sin(t * 0.43) * 0.06 * live);
  P.tongue.rotation.set(Math.max(0, Math.sin(t * 1.2 + s7)) * 0.6 * (d.fed + 0.3) * live, 0, 0);
  for (const [s, k] of SIDES) {
    // antennae: questing toward what she is watching; drooping when she is spent
    P['antA' + s]?.rotation.set(-0.3 + Math.sin(t * 1.7 + k + s7) * 0.25 * live - d.dead * 0.8, k * Math.sin(t * 1.1 + k) * 0.25 * live + d.look * 0.4, k * 0.12);
    P['antB' + s]?.rotation.set(0.8 + Math.sin(t * 2.3 + k * 2) * 0.3 * live + d.dead * 0.6, 0, 0);
    // mandibles: chewing when fed, working when she inhales
    const chew = Math.max(d.fed, d.suck * 0.5, 0.1);
    P['mand' + s]?.rotation.set(0, k * Math.max(0, Math.sin(t * 7 + k)) * 0.45 * chew * live, 0);
    // wings: folded flat on the back; every so often a useless buzz (and when she spits)
    const buzz = Math.max(Math.sin(t * 0.21 + s7) > 0.93 ? 1 : 0, d.spit, d.suck * 0.4) * live;
    for (const [w, ph] of [['wF', 0], ['wH', 0.6]] as const) {
      const o = P[w + s]; if (!o) continue;
      const beat = Math.sin(t * 80 + ph) * buzz;
      o.rotation.set(beat * 0.2, k * (0.12 + (1 - buzz) * 1.1), k * (0.15 * buzz + beat * 0.7 + (1 - buzz) * 0.1 - d.dead * 0.4));
    }
    // legs: the front pair rake toward the maw; the others brace, shifting her weight with her breath
    for (let i = 0; i < 3; i++) {
      const a = P[`l${i}a${s}`], b = P[`l${i}b${s}`], c = P[`l${i}c${s}`]; if (!a) continue;
      const curl = d.dead;
      if (i === 0) {
        const rk = Math.sin(t * 3.4 + k * 1.3) * d.rake * live, idle = Math.sin(t * 0.8 + k + s7) * 0.06 * live;
        a.rotation.set(-0.15 * d.rake + rk * 0.35 + idle - curl * 0.6, k * (0.12 * d.rake), k * (-0.1 * d.rake + curl * 0.5));
        b.rotation.set(rk * 0.45 + 0.3 * d.rake * Math.max(0, -Math.sin(t * 3.4 + k * 1.3)) + curl * 0.6, 0, k * curl * 0.4);
        c?.rotation.set(-rk * 0.35 + curl * 0.8, 0, 0);
      } else {
        const sh = Math.sin(t * 0.9 + i + k + s7) * 0.04 * live;
        a.rotation.set(sh - curl * 0.4, 0, k * (br * 0.02 + curl * 0.7));
        b.rotation.set(0, 0, k * (-br * 0.03 + curl * 0.8));
        c?.rotation.set(sh * 0.5, 0, k * curl * 0.6);
      }
    }
  }
}

function animateQueen(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * QUEEN_KIT_V);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); filmPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, any>, seed = hashId(c.id, 4);
  const sm = (k: string, to: number, rate: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
  const f = fxPoll(rig, c);
  if (f?.key === 'gulp') ud.gl = 1;
  if (f?.key === 'spit') ud.sp = 1;
  ud.gl = Math.max(0, (ud.gl ?? 0) - dt * 1.4); ud.sp = Math.max(0, (ud.sp ?? 0) - dt * 1.1);
  const md: string = c.dead ? '' : (n.md ?? '');
  const gut: string[] = Array.isArray(n.gut) ? n.gut : [];
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 0.8) : 0;
  const lp = localIn(c);
  const look = lp && !c.dead ? Math.max(-1, Math.min(1, angd(Math.atan2(lp.z - c.z, lp.x - c.x), c.facing) * -0.7)) : 0;
  poseQueen(K, {
    t, dt, seed, gape: sm('gp', md === 'gape' || md === 'warn' ? 1 : 0, md === 'warn' ? 4 : 2), suck: sm('sk', md === 'suck' ? 1 : 0, md === 'suck' ? 2.5 : 4), gulp: ud.gl, spit: Math.max(ud.sp, sm('spm', md === 'spit' ? 1 : 0, 5)),
    churn: sm('ch', gut.length || n.sw ? 1 : 0.15, 0.8), lay: sm('ly', md === 'lay' ? 1 : 0, 1.2), fed: sm('fd', md === 'fed' ? 1 : 0, 3),
    look: sm('lk', look, 1.5), rake: sm('rk', md === 'suck' || md === 'fed' || md === 'warn' ? 1 : 0.1, 3), kick: sm('kk', n.sw ? 1 : 0, 3),
    dead: ud.dk * ud.dk * (3 - 2 * ud.dk), flinch: flinchOf(c),
  });
  uprightDead(K, c);
  syncGut(K, c.dead ? [] : gut, (code) => { const at = Number(code.split('@')[1]); return isFinite(at) && G.time ? (G.time - at) / DIGEST_T : 0.3; }, t, dt);
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  // the unit being sucked in or held inside: handled on that unit's own machine
  if (G.local) swallowedLocal(c, n, G.local, dt);
  if (lp && !c.dead && c.visibleToLocal) {
    const d = dist(lp, c);
    if (n.md === 'warn' && d < 8) thinkOnce(lp, 'queen_warn', 'She is gaping at me, legs raking the floor. I am too close to her comb. Back off.', 20);
    else if (n.sw && n.sw !== lp.id && d < 14) thinkOnce(lp, 'queen_sw', 'It swallowed them. They are still moving in there. I can cut them out.', 30);
    else if (gut.length && d < 9) thinkOnce(lp, 'queen_gut', ['I can see things turning over inside her. Through her skin.', 'There is a chair in there. And something with legs.'][Math.floor(t * 0.1) % 2], 70);
    else if (d < 12) thinkOnce(lp, 'queen', ['A bee the size of a car. Her belly is open. It is a mouth.', 'The whole front of her is a mouth, and it is breathing.', 'The bees bring her meat. She does not even look at it. She just opens.'][Math.floor(t * 0.13) % 3], 90);
  }
}
const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// ------------------------------------------------------------------ swallowed: the unit's side (runs on the swallowed unit's machine)
/** the maw's centre in the world */
export function mawPoint(c: Creature, out = 0): { x: number; z: number } {
  const r = MAW_Z + out;
  return { x: c.x + Math.cos(c.facing) * r, z: c.z + Math.sin(c.facing) * r };
}
interface Held { cid: string; t: number; dmgT: number; rounds: number; next: number; act: StruggleAction | null; won: boolean; hurt: number }
let held: Held | null = null;
const DMG_EVERY = 1.3, MAX_ROUNDS = 3;
function swallowedLocal(c: Creature, n: Record<string, any>, p: Player, dt: number) {
  // being pulled in: the inhale drags at anyone in front of her
  // (only the unit she means to take is really pulled; anyone else close by just feels the draught)
  if (n.md === 'suck' && !c.dead && p.zoneKey === c.zoneKey && !p.body.dead && n.sw !== p.id) {
    const m = mawPoint(c, 0.2), dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
    const ahead = Math.cos(angd(Math.atan2(p.z - c.z, p.x - c.x), c.facing));
    const R = n.tp === p.id ? 4.2 : 2.2;
    if (d < R && ahead > 0.2) {
      const k = (1 - d / R) * (n.tp === p.id ? 2.6 : 0.8) * dt * 6;
      p.vx += (dx / (d || 1)) * k; p.vz += (dz / (d || 1)) * k;
      G.pr.shake = Math.max(G.pr.shake, 0.2 * (1 - d / R));
      thinkOnce(p, 'queen_pull', 'She is breathing in, and I am going with it. RUN.', 25);
    }
  }
  const mine = n.sw === p.id && !c.dead && !p.body.dead && p.zoneKey === c.zoneKey;
  if (!mine) { if (held && held.cid === c.id) releaseLocal(p, c, false); return; }
  if (!held || held.cid !== c.id) {
    held = { cid: c.id, t: 0, dmgT: 0, rounds: 0, next: 0.6, act: null, won: false, hurt: 0 };
    p.actions.clear();
    const act = new StruggleAction(p, 'cb_struggle', 600, { x: c.x, z: c.z });
    act.name = 'Swallowed';
    p.actions.add(act);
    held.act = act;
    G.audio?.at?.('arv_gulp', p.x, p.z, 1);
    G.pr.fx.hurt = Math.min(1, G.pr.fx.hurt + 0.4);
    G.camera?.punch?.(0.06, 0.5);
    bus.emit('think', p, 'It is dark and it is hot and it is SQUEEZING. Get out. Get OUT.');
  }
  const h = held;
  h.t += dt;
  // pinned in the maw, half in, half out: wherever she is, that is where you are
  const m = mawPoint(c, -0.05);
  p.x += (m.x - p.x) * Math.min(1, dt * 12); p.z += (m.z - p.z) * Math.min(1, dt * 12);
  p.vx = 0; p.vz = 0; p.speed = 0;
  p.facing = p.targetFacing = c.facing;
  // the stomach works on you: acid burns, never quite enough to finish you (survivable, but it costs)
  h.dmgT += dt;
  if (h.dmgT > DMG_EVERY) {
    h.dmgT = 0;
    if (p.body.health > 22) {
      const part = (['torso_u', 'torso_l', 'thigh_l', 'thigh_r', 'uarm_l', 'uarm_r', 'shin_l', 'shin_r'] as const)[Math.floor(Math.random() * 8)];
      p.body.addInjury(part as any, 'burn', 0.1 + Math.random() * 0.06, { dirty: true } as any);
      p.body.health = Math.max(20, p.body.health - 1.6);
      p.body.panic = Math.min(100, p.body.panic + 6);
      G.pr.fx.hurt = Math.min(1, G.pr.fx.hurt + 0.18);
      h.hurt++;
      if (Math.random() < 0.4) G.audio?.at?.('bh_squelch', p.x, p.z, 0.6);
    }
  }
  // the struggle: rounds of the struggle QTE (mash, alternate, timed); win and you tear out through the lips
  const qte = (G as any).combat?.qte;
  if (qte && !qte.active && h.t > h.next && !h.won) {
    const started = qte.start({
      reason: 'grab', cid: c.id, dur: 6.2 - Math.min(1.5, h.rounds * 0.5), grip: 1.25 + h.rounds * 0.1, act: h.act,
      stages: [{ kind: 'mash', need: 1 }, { kind: 'alt', need: 1 }, { kind: 'timed', need: 2 }],
      onWin: () => { h.won = true; poke(p, c, 'esc'); releaseLocal(p, c, true); },
      onLose: () => {
        h.rounds++; h.next = h.t + 1.4;
        G.audio?.at?.('bh_gulp', p.x, p.z, 0.8);
        G.pr.shake = Math.max(G.pr.shake, 0.7);
        if (p.body.health > 24) { p.body.health = Math.max(22, p.body.health - 4); p.body.addInjury('torso_u' as any, 'burn', 0.2, { dirty: true } as any); }
        bus.emit('think', p, h.rounds >= MAX_ROUNDS ? 'I cannot... she is going to bring me back up. I can feel it.' : ['It pulled me deeper.', 'My hands keep slipping on it.', 'The walls are closing. Again. AGAIN.'][h.rounds % 3]);
        // she cannot keep a struggling unit down for ever: three lost rounds and she heaves it back up
        if (h.rounds >= MAX_ROUNDS) poke(p, c, 'heave');
      },
    });
    if (!started) h.next = h.t + 0.5;
  }
  // no struggle system (a stripped-down build): mash the shove key
  if (!qte && G.input?.hit?.('shove') && Math.random() < 0.18) { h.won = true; poke(p, c, 'esc'); releaseLocal(p, c, true); }
}
function releaseLocal(p: Player, c: Creature, tore: boolean) {
  const h = held; held = null;
  if (!h) return;
  if (h.act) { h.act.done = true; if (p.actionAnim === 'cb_struggle') p.stopAnim(); }
  if ((G as any).combat?.qte?.active) (G as any).combat.qte.cancel();
  // out through the lips, onto the floor in front of her, covered in it
  const m = mawPoint(c, 1.35);
  p.x = m.x; p.z = m.z;
  p.vx = Math.cos(c.facing) * 3; p.vz = Math.sin(c.facing) * 3;
  p.playAnim?.('get_up', 1.1);
  G.audio?.at?.('arv_spit', p.x, p.z, 1);
  G.pr.shake = Math.max(G.pr.shake, 0.6);
  op('decal', { z: c.zoneKey, d: { x: p.x, z: p.z, w: 1.4, d: 1.2, rot: Math.random() * 6, tex: 'lg_puddle' } });
  bus.emit('think', p, tore ? 'I tore out through its lips. I am out. I am OUT.' : 'It spat me back up. Everything burns. Move.');
}

// ------------------------------------------------------------------ host brain
const WARN_T = 2.6, DIGEST_T = 40, SUCK_T = 1.7, GULP_T = 1.2, LAY_T = 6, SPIT_T = 1.1, FED_T = 2.4;
const SPARE = new Set(['queen_bee', 'bumble_bee', 'bee_keeper']);
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
interface Tgt { kind: 'p' | 'c' | 'i' | 'o'; id: string; x: number; z: number; d: number; ref: any }
function inFront(c: Creature, x: number, z: number) { return Math.cos(angd(Math.atan2(z - c.z, x - c.x), c.facing)); }
function addGut(c: Creature, code: string) {
  const n = net(c);
  const list: string[] = Array.isArray(n.gut) ? n.gut.slice() : [];
  list.push(code + '@' + G.time.toFixed(1));
  while (list.length > 6) list.shift();
  n.gut = list;
}
/** host: what is within reach of the maw that she would take */
function pickTarget(c: Creature, z: Zone): Tgt | null {
  const m = mawPoint(c, 0.3), skip = (c.mem.skip ?? {}) as Record<string, number>;
  let best: Tgt | null = null;
  const consider = (t: Tgt) => { if (t.d < 3.6 && inFront(c, t.x, t.z) > -0.2 && (!best || t.d < best.d)) best = t; };
  // units: territorial, not a hunter. Only one standing in her bowl (after a warning), or one that hurt her
  const anger = c.mem.anger as { pid: string; until: number } | undefined;
  for (const p of playersIn(c.zoneKey)) {
    if (p.body.dead || p.inVehicle || (skip[p.id] ?? 0) > G.time) continue;
    const d = Math.hypot(p.x - m.x, p.z - m.z) - 0.6, angry = anger && anger.pid === p.id && anger.until > G.time;
    if (d < (angry ? 3.4 : 1.7)) consider({ kind: 'p', id: p.id, x: p.x, z: p.z, d, ref: p });
  }
  for (const o of CS().creatures.values()) {
    if (o.zoneKey !== c.zoneKey || o === c || SPARE.has(o.sp.key) || o.sp.flags?.ghost || o.sp.flags?.immortal || (o.height ?? 1) > 2.4) continue;
    consider({ kind: 'c', id: o.id, x: o.x, z: o.z, d: Math.hypot(o.x - m.x, o.z - m.z) - 0.3, ref: o });
  }
  for (const wi of floorItemsAround(z, m.x, m.z, 3)) consider({ kind: 'i', id: 'i' + wi.item.uid, x: wi.x, z: wi.z, d: Math.hypot(wi.x - m.x, wi.z - m.z) + 0.4, ref: wi });
  // furniture: anything that is not built in (and the remains the bees did not finish)
  const tx = Math.floor(m.x), tz = Math.floor(m.z);
  for (let y = tz - 2; y <= tz + 2; y++) for (let x = tx - 2; x <= tx + 2; x++) {
    if (!z.inb(x, y)) continue;
    for (const o of z.tileObjs.get(z.idx(x, y)) ?? []) {
      const d0 = objDef(o.key); if (!d0 || d0.onWall || d0.ceiling) continue;
      const tags = d0.tags ?? [];
      const loose = (d0.movable ?? 0) > 0 && (d0.movable ?? 0) < 90 && !tags.includes('fixed');
      if (!loose && !tags.includes('remains')) continue;
      if ((d0.w ?? 1) * (d0.d ?? 1) > 2) continue;
      const [ox, oz] = objCentre(o);
      consider({ kind: 'o', id: 'o' + o.uid, x: ox, z: oz, d: Math.hypot(ox - m.x, oz - m.z) + 0.2, ref: o });
    }
  }
  return best;
}
function swallow(c: Creature, z: Zone, tg: Tgt) {
  const cs = CS(), n = net(c), m = c.mem;
  const mp = mawPoint(c, 0.4);
  if (tg.kind === 'p') {
    const p = tg.ref as Player;
    if (!G.players.has(p.id) || p.body.dead || Math.hypot(p.x - mp.x, p.z - mp.z) > 1.8) return false;
    n.sw = p.id; m.swT = 0; m.swPain = 0;
    for (const q of playersIn(c.zoneKey)) if (dist(q, c) < 14) { ruleShown(c); break; }
  } else if (tg.kind === 'c') {
    const o = tg.ref as Creature;
    if (!cs.creatures.has(o.id) || Math.hypot(o.x - mp.x, o.z - mp.z) > 1.8 + o.radius) return false;
    cs.remove(o);
    addGut(c, o.sp.key === 'bumble_bee' ? 'b:' + Math.floor(hashId(o.id) * 3) : 'c:' + o.sp.key);
    m.hunger = Math.max(0, (m.hunger ?? 0.5) - 0.35);
  } else if (tg.kind === 'i') {
    const wi = tg.ref;
    takeFloorItem(c, wi, 'gut');
    addGut(c, 'i:' + wi.item.key);
    m.hunger = Math.max(0, (m.hunger ?? 0.5) - 0.05);
  } else {
    const o = tg.ref as TileObject;
    if (!z.objects.has(o.uid)) return false;
    // whatever was in it goes down too
    if (o.inv) for (const it of o.inv.items.slice(0, 4)) op('dropFloor', { z: c.zoneKey, item: { ...it, data: it.data }, x: mp.x, zz: mp.z });
    op('objRemove', { z: z.key, uid: o.uid });
    addGut(c, 'o:' + o.key);
    m.hunger = Math.max(0, (m.hunger ?? 0.5) - (o.key.startsWith('rm_') ? 0.3 : 0.1));
  }
  fx(c, 'gulp');
  setMd(c, 'gulp');
  playAt('arv_gulp', c, 1, 18, 0.55); playAt('gore_squelch', c, 0.8, 14, 0.5);
  return true;
}
/** host: let the swallowed unit go (they tore out, a partner cut them free, she was hurt into heaving, or she gave up) */
function release(c: Creature, why: 'esc' | 'cut' | 'pain' | 'heave' | 'dead') {
  const n = net(c), pid = n.sw;
  if (!pid) return;
  n.sw = '';
  (c.mem.skip ??= {})[pid] = G.time + 22;
  if (why !== 'dead') { setMd(c, 'spit'); fx(c, 'spit'); playAt('arv_spit', c, 1, 18, 0.5); playAt('bh_vomit', c, 0.8, 14, 0.6); }
}
/** host (and the bees): a forager delivers its load to her */
export function feedQueen(q: Creature) {
  const m = q.mem;
  m.hunger = Math.max(0, (m.hunger ?? 0.5) - 0.18);
  m.fedN = (m.fedN ?? 0) + 1;
  if (!net(q).md || net(q).md === 'gape') { setMd(q, 'fed'); fx(q, 'fed'); }
  playAt('bh_chew', q, 0.7, 12, 0.5);
}
/** the nearest live queen in a zone */
export function queenIn(zk: string): Creature | null {
  for (const o of CS().creatures.values()) if (o.zoneKey === zk && !o.dead && o.sp.key === 'queen_bee') return o;
  return null;
}
function nearestBrood(z: Zone, x: number, zz: number, wantRoom: boolean): TileObject | null {
  let best: TileObject | null = null, bd = 14;
  for (const o of z.objects.values()) {
    if (o.key !== 'qb_brood') continue;
    const b = o.state?.brood ?? 3;
    if (wantRoom ? b >= 6 : b <= 0) continue;
    const [ox, oz] = objCentre(o); const d = Math.hypot(ox - x, oz - zz);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function thinkQueen(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  if (!m.init) { m.init = 1; m.hunger = 0.6; m.layAt = G.time + rng.float(25, 50); m.hatchAt = G.time + rng.float(40, 80); m.persistent = true; n.gut = n.gut ?? []; restoreStore(c, 'gut'); }
  m.mdT = (m.mdT ?? 0) + dt;
  m.hunger = Math.min(1, (m.hunger ?? 0.5) + dt / 220);
  stop(c);
  // digestion: the oldest things in her go first
  if (Array.isArray(n.gut) && n.gut.length) {
    const keep = (n.gut as string[]).filter((g) => G.time - Number(g.split('@')[1] ?? G.time) < DIGEST_T);
    if (keep.length !== n.gut.length) { n.gut = keep; playAt('bh_gurgle', c, 0.7, 14, 0.5); if (!keep.some((g) => g[0] === 'i')) m.gut = []; }
  }
  // the unit inside her
  if (n.sw) {
    const p = G.players.get(n.sw) as Player | undefined;
    m.swT = (m.swT ?? 0) + dt;
    if (ev.hurt > 0) m.swPain = (m.swPain ?? 0) + ev.hurt;
    if (!p || p.body.dead || p.zoneKey !== c.zoneKey) release(c, 'dead');
    else if (poked(c, 'esc') === n.sw) release(c, 'esc');
    else if (poked(c, 'heave') === n.sw || m.swT > 30) release(c, 'heave');
    else if (poked(c, 'cut')) { release(c, 'cut'); cs.damage(poked(c, 'cut') ?? '', c.id, 10, c.x, c.z, 0, 'blade'); }
    else if ((m.swPain ?? 0) > 24) release(c, 'pain');
    else { setMd(c, 'churn'); if ((m.swSnd ?? 0) < G.time) { m.swSnd = G.time + rng.float(1.5, 3); playAt(rng.chance(0.5) ? 'bh_gurgle' : 'arv_squelch', c, 0.9, 14, 0.5); } return true; }
  }
  if (ev.hurt > 0) {
    const pid = c.targetId && G.players.has(c.targetId) ? c.targetId : playersIn(c.zoneKey).sort((a, b) => dist(a, c) - dist(b, c))[0]?.id;
    if (pid) m.anger = { pid, until: G.time + 18 };
  }
  if (ev.hurt > 0 && n.md !== 'spit' && n.md !== 'suck') {
    // hurt: a heave that brings up the last thing she swallowed, at whoever did it
    setMd(c, 'spit'); fx(c, 'spit'); playAt('arv_spit', c, 0.9, 16, 0.55);
    const list: any[] = c.mem.gut ?? [];
    if (list.length && rng.chance(0.6)) { const s = list.pop(); const mp = mawPoint(c, 0.9); op('dropFloor', { z: c.zoneKey, item: s, x: mp.x, zz: mp.z, v: [Math.cos(c.facing) * 2, 2, Math.sin(c.facing) * 2] }); }
    return true;
  }
  const md: string = n.md ?? '';
  if (md === 'gulp') { if (m.mdT > GULP_T) setMd(c, ''); return true; }
  if (md === 'spit') { if (m.mdT > SPIT_T) setMd(c, ''); return true; }
  if (md === 'fed') { if (m.mdT > FED_T) setMd(c, ''); return true; }
  if (md === 'churn') setMd(c, '');
  if (md === 'lay') {
    if (m.mdT > LAY_T) {
      const b = nearestBrood(z, c.x, c.z, true);
      if (b) op('objState', { z: z.key, uid: b.uid, patch: { brood: Math.min(6, (b.state?.brood ?? 3) + 1) } });
      playAt('bh_plop', c, 0.8, 12, 0.5);
      setMd(c, ''); m.layAt = G.time + rng.float(45, 90);
    } else if ((m.laySnd ?? 0) < G.time) { m.laySnd = G.time + 1.6; playAt('arv_squelch', c, 0.6, 10, 0.6); }
    return true;
  }
  // the inhale before a swallow: she turns to it, breathes in, then snaps shut on whatever is there
  if (md === 'suck') {
    const tg = m.tg as Tgt | undefined;
    if (tg) faceTo(c, tg.ref?.x ?? tg.x, tg.ref?.z ?? tg.z);
    if (m.mdT > SUCK_T) {
      const ok = tg ? swallow(c, z, { ...tg, x: tg.ref?.x ?? tg.x, z: tg.ref?.z ?? tg.z }) : false;
      if (!ok) { setMd(c, 'gulp'); fx(c, 'gulp'); playAt('bh_plop', c, 0.8, 12, 0.45); if (tg?.kind === 'p') (m.skip ??= {})[tg.id] = G.time + 6; }
      m.nextEat = G.time + (m.hunger > 0.6 ? rng.float(2, 4) : rng.float(6, 12));
    }
    return true;
  }
  // brood hatches: a grub that has been fed long enough crawls out as a bee
  if (G.time > (m.hatchAt ?? 0)) {
    m.hatchAt = G.time + rng.float(60, 120);
    let bees = 0; for (const o of cs.creatures.values()) if (o.zoneKey === c.zoneKey && !o.dead && o.sp.key === 'bumble_bee') bees++;
    const b = bees < 9 ? nearestBrood(z, c.x, c.z, false) : null;
    if (b) {
      const [bx, bz] = objCentre(b);
      op('objState', { z: z.key, uid: b.uid, patch: { brood: Math.max(0, (b.state?.brood ?? 3) - 1) } });
      const nb = cs.spawn('bumble_bee', c.zoneKey, bx + rng.float(-0.4, 0.4), bz + rng.float(-0.4, 0.4));
      if (nb) { nb.mem.persistent = false; playAt('bh_squelch', nb, 0.7, 10, 0.8); }
    }
  }
  // fed enough: she lays
  if ((m.hunger ?? 1) < 0.55 && G.time > (m.layAt ?? 0) && nearestBrood(z, c.x, c.z, true)) { setMd(c, 'lay'); return true; }
  if (G.time > (m.nextEat ?? 0)) {
    const tg = pickTarget(c, z);
    if (tg) {
      faceTo(c, tg.x, tg.z);
      const angry = (m.anger?.pid === tg.id && m.anger.until > G.time);
      // a unit in her bowl gets a warning first: the maw thrown wide, the front legs raking, a hiss. Back off and that is all
      if (tg.kind === 'p' && !angry && !(md === 'warn' && m.mdT > WARN_T)) {
        if (md !== 'warn') { setMd(c, 'warn'); playAt('arv_hiss', c, 0.9, 14, 0.45); playAt('limb_flies', c, 0.7, 12, 1.3); }
        return true;
      }
      if (inFront(c, tg.x, tg.z) > 0.8 || tg.d < 1) {
        m.tg = tg; setMd(c, 'suck'); n.tp = tg.kind === 'p' ? tg.id : '';
        playAt('bh_in', c, 1, 16, 0.45); playAt('arv_hiss', c, 0.7, 14, 0.5);
        if (tg.kind === 'p') for (const q of playersIn(c.zoneKey)) if (dist(q, c) < 12) ruleShown(c);
      }
      return true;
    }
  }
  // nothing in reach: she breathes, gapes now and then, watches
  if (md === 'warn') setMd(c, '');
  const near = playersIn(c.zoneKey).filter((p) => dist(p, c) < 9).sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (near) faceTo(c, near.x, near.z);
  if (md === '' && rng.chance(dt * 0.08)) setMd(c, 'gape');
  else if (md === 'gape' && m.mdT > 3) setMd(c, '');
  if (c.noiseCooldown <= 0 && rng.chance(dt * 0.12)) { playAt(rng.chance(0.5) ? 'arv_heart' : 'bh_gurgle', c, 0.6, 14, 0.45 + rng.float(0, 0.1)); c.noiseCooldown = 5; }
  return true;
}

const QUEEN = def({
  key: 'queen_bee', name: 'Queen Bee', code: 'LG-03 // FAUNA, APID (SOVEREIGN)', temperament: 'neutral', threat: 3,
  rule: { name: 'THE OPEN STOMACH', text: 'She cannot move and she does not chase. She swallows whatever lies within reach of her front legs, but a unit only if it steps into her bowl and stays after she gapes and rakes at it, or if it hurts her. Keep out of the comb and she leaves you be. Swallowed, fight the struggle to tear out through her lips; a partner can cut you free, or hurt her until she heaves you up.', tell: 'A bee the size of a car, sitting in the comb. The whole front of her belly is a mouth, and it is open.' },
  hp: 260, walk: 0.05, run: 0.1, turn: 0.55, radius: 1.25, height: 2.1, sight: 9, fov: 1.8, hearing: 1, smell: true,
  zones: ['ledge'], weight: 0, group: [1, 1], maxPerZone: 1, diet: 'meat',
  meat: [['meat_raw', 4]],
  sounds: { idle: 'bh_gurgle', alert: 'bh_in', hurt: 'arv_squelch', death: 'underlay_die', loop: 'limb_flies' } as any,
  scan: {
    cls: 'Fauna / apid, eusocial sovereign, sessile',
    notes: [
      'The mother of the Giant Bumble Bees: three metres of banded fur sat in a bowl of comb. She cannot fly or walk.',
      'Her abdomen split open along the belly and never closed. It is a mouth: ribbed, wet, ringed with hooked plates.',
      'Anything within reach of her front legs she inhales and swallows. Through the stretched skin of her flanks you can watch it turn over inside her.',
      'The bees forage the dead of the backrooms and fly the meat home to her. Fed, she lays brood into the comb.',
    ],
  },
  gore: { blood: 'pale', tint: 0xf0c060, flesh: 0xe8a830, sever: ['l0aL', 'l0aR', 'l1aL', 'l1aR', 'l2aL', 'l2aR', 'antAL', 'antAR', 'ovi'], head: 'head', gib: false },
  build: () => buildQueenBee(0), animate: animateQueen, think: thinkQueen,
});
(QUEEN as any).handlesSevered = true;
// her corpse gives back what she swallowed
bus.on('creatureKilled', (c: Creature) => {
  if (c?.sp?.key !== 'queen_bee' || G.role === 'client') return;
  try { release(c, 'dead'); dropStored(c, 'gut', mawPoint(c, 1).x, mawPoint(c, 1).z); net(c).gut = []; HIVE_GONE.add(c.zoneKey); } catch (e) { console.error(e); }
});
creatureMenu('queen_bee', (p, c, opts) => {
  const n = netOf(c);
  const m = mawPoint(c, 0.9);
  if (n.sw && n.sw !== p.id) {
    const who = (G.players.get(n.sw) as Player | undefined)?.name ?? 'them';
    opts.push({
      label: `Cut ${who} free`, action: () => queueAt(p, m.x, m.z, new UseObjectAction(p, 'Cut free', 2.4, 'pickup', () => {
        if (!CS().creatures.has(c.id) || c.dead) return;
        poke(p, c, 'cut');
        G.audio?.at?.('gore_tear', c.x, c.z, 1);
        bus.emit('think', p, ['I cut along the lip. It opened. Grab my hand!', 'It let go. I think it hurt it.'][Math.floor(Math.random() * 2)]);
      }), 1.4, false),
    });
  }
});

// ------------------------------------------------------------------ the hive: she is always in it (host)
const HIVE_GONE = new Set<string>(), HIVE_SL = new Set<string>();
let hiveSys = false;
bus.on('enterZone', () => {
  const g: any = G;
  if (hiveSys || !g?.addSystem) return;
  hiveSys = true;
  let acc = 0;
  g.addSystem({
    name: 'queenHive',
    update: (dt: number) => {
      acc += dt; if (acc < 2) return; acc = 0;
      if (G.role === 'client' || !G.creatures) return;
      const zs = new Set<string>(); for (const p of G.players.values()) zs.add(p.zoneKey);
      for (const zk of zs) {
        const z = G.zones.get(zk) as Zone | undefined;
        const h = z?.meta?.hive as [number, number] | undefined;
        // the Still Lifes sat by the pools for the bees to eat (once a session: what the bees make of them stays)
        if (z && h && !HIVE_SL.has(zk) && Array.isArray(z.meta.slSeats)) {
          HIVE_SL.add(zk);
          for (const [sx, sz] of z.meta.slSeats as [number, number][]) { const s = CS().spawn('still_life', zk, sx, sz); if (s) s.mem.persistent = true; }
        }
        if (!z || !h || HIVE_GONE.has(zk) || queenIn(zk)) continue;
        const q = CS().spawn('queen_bee', zk, h[0], h[1]);
        if (q) { q.facing = q.targetFacing = (z.meta.hiveFacing as number | undefined) ?? -Math.PI / 2; q.mem.persistent = true; }
      }
    },
  });
});

// ------------------------------------------------------------------ stand-alone posing (gallery, video, posters)
export type QueenPose = 'idle' | 'gape' | 'suck' | 'gulp' | 'churn' | 'lay' | 'spit' | 'fed' | 'dead';
/**
 * Animate a queen rig with no game running: call every frame with a running
 * clock. `gut` lists what to show churning inside her (codes as above);
 * 'gulp' loops a swallow every 3 s.
 */
export function poseQueenBee(rig: KitRig, t: number, dt: number, pose: QueenPose = 'idle', o: { gut?: string[]; variant?: number } = {}) {
  const ud = rig.kit.m as Record<string, number>;
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant) { kitPersonalize(rig, o.variant); filmPersonalize(rig, o.variant); }
  kitSync(rig);
  if (pose === 'gulp' && Math.floor(t / 3) !== ud.gq) { ud.gq = Math.floor(t / 3); ud.gl = 1; }
  if (pose === 'spit' && Math.floor(t / 2.5) !== ud.sq) { ud.sq = Math.floor(t / 2.5); ud.sp = 1; }
  ud.gl = Math.max(0, (ud.gl ?? 0) - dt * 1.4); ud.sp = Math.max(0, (ud.sp ?? 0) - dt * 1.1);
  const is = (q: QueenPose) => (pose === q ? 1 : 0);
  const gut = o.gut ?? (pose === 'churn' || pose === 'gulp' ? ['b:1', 'o:chair_office', 'i:flashlight'] : []);
  poseQueen(rig, {
    t, dt, seed: 0.37, gape: is('gape'), suck: is('suck'), gulp: ud.gl, spit: Math.max(ud.sp, is('spit') * 0.4), churn: gut.length ? 1 : 0.15, lay: is('lay'), fed: is('fed'),
    look: Math.sin(t * 0.3) * 0.4, rake: pose === 'suck' || pose === 'fed' ? 1 : 0.1, kick: 0, dead: is('dead'), flinch: 0,
  });
  syncGut(rig, gut, () => (pose === 'churn' ? (t % 20) / 20 : 0.1), t, dt);
  rig.kit.F.fx.value.y += dt;
}
QUEEN.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['idle', 'suck', 'gulp', 'churn', 'lay', 'fed'][Math.floor(t / 5) % 6]) as QueenPose;
  const gut = u.get('gut') ? u.get('gut')!.split(',') : undefined;
  poseQueenBee(rig as KitRig, t, 1 / 60, q, { gut, variant: u.get('v') !== null ? Number(u.get('v')) : undefined });
};
horrify(QUEEN, { twitch: 0.12, snap: 0.05, breathe: 0.006, parts: /ant|mand|tongue|l0[abc]/ });
void THREE; void remainsIn;
