import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, stop, faceTo, findSpot, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, walkable } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, V3, Wt, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash, usFor, gauss } from '../kit/humanoids';
import { chain, sac, paintCap, paintEye } from '../kit/organic';
import { attachFilm, attachInner, filmPersonalize, uprightDead, films } from '../kit/gel';
import { buildBee, poseBee } from './bumble_bee';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE GUMMY BEAR — a brown bear that went over the Ledge (the far, melting
// edge of the place, where things soften and run) and lived. Its whole body
// has gone to a translucent amber-red jelly the consistency of a sweet. Inside
// it you can see what is left of the bear: the spine, the ribs, a heart, a
// stomach, whatever it last ate. Its fur still grows: wet, matted clumps of it
// push out through the jelly all over, lying back and dripping, torn away in
// patches where the bare candy shows, and the bear's limbs are still there, but not where they were: a
// paw comes out of its flank, a jaw opens where a shoulder should be, the head
// has slid forward and sideways and hangs half-sunk in the front of the blob.
// It hunts the Giant Bumble Bees (stalk, coil, lunge, engulf, digest) and,
// after two meals, pinches itself in two: each half grows back into a bear,
// regrowing its missing parts wherever they happen to come back. That is why
// no two of them are wrong in the same way.
//   gummy_bear   two skinned kit meshes on one skeleton: the opaque bear (skeleton,
//                organs, fur islands, limbs, head) inside a translucent gel shell
//                (src/creatures/kit/gel.ts), soft-body spring lobes for the jiggle.
// POSTER / BANNER API (stand-alone, no game needed):
//   buildGummyBear(variant?)                         -> KitRig (rig.root into any scene)
//   poseGummyBear(rig, t, dt, pose, { fs, prey })    pose: 'walk' | 'idle' | 'stalk' | 'coil' |
//                                                    'lunge' | 'engulf' | 'digest' | 'split' | 'warn' | 'dead'
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
const Z0 = -0.78, Z1 = 0.66;

/** where each individual's parts came back: the flank paw, the shoulder jaw, the one hind leg, the head's slump */
interface Wrong { arm: V3; armDir: V3; jaw: V3; hip: V3; tilt: number; fur: [number, number, number, number][] }
const WRONG: Wrong[] = [
  { arm: [0.47, 0.54, 0.04], armDir: [0.16, 0.13, 0.02], jaw: [-0.45, 0.6, 0.18], hip: [-0.22, 0.22, -0.54], tilt: 1,
    fur: [[0.28, 0.6, -0.95, 0.75], [0.12, 0.36, 1.25, 2.15], [0.06, 0.24, -2.1, -1.2], [0.8, 0.93, -1.9, 1.5], [0.5, 0.7, -2.0, -1.45]] },
  { arm: [0.06, 0.8, -0.22], armDir: [0.05, 0.18, -0.06], jaw: [0.53, 0.42, -0.16], hip: [0.24, 0.22, -0.52], tilt: -1,
    fur: [[0.12, 0.42, -1.0, 0.3], [0.45, 0.66, -2.2, -1.1], [0.55, 0.75, 1.0, 1.9], [0.8, 0.93, -1.5, 1.9], [0.1, 0.3, 1.6, 2.4]] },
  { arm: [-0.5, 0.46, -0.3], armDir: [-0.16, 0.08, -0.08], jaw: [-0.41, 0.64, 0.26], hip: [0.2, 0.2, -0.56], tilt: 1,
    fur: [[0.35, 0.68, -0.3, 1.1], [0.1, 0.3, -1.0, 0.4], [0.5, 0.72, 1.3, 2.2], [0.8, 0.93, -1.7, 1.7], [0.22, 0.42, -2.4, -1.6]] },
];

// ------------------------------------------------------------------ the blob's shape (adult, model space, facing +z)
/** a point on the jelly surface: t along the body (tail 0 -> nose 1), a around (0 top, +pi/2 left, +-pi underneath), k radial scale */
function blobAt(t: number, a: number, v: number, k = 1): V3 {
  const W = WRONG[v];
  const tc = Math.min(0.985, Math.max(0.015, t));
  const env = Math.pow(Math.sin(Math.PI * tc), 0.5);
  const rear = 1 + 0.18 * gauss(t, 0.3, 0.2) - 0.1 * gauss(t, 0.92, 0.1);
  const rx = 0.52 * env * rear, ry = 0.4 * env * (1 + 0.12 * gauss(t, 0.4, 0.15) + 0.16 * gauss(t, 0.66, 0.1));
  const cy = 0.4 + 0.08 * gauss(t, 0.68, 0.16);
  const z = Z0 + (Z1 - Z0) * t;
  // slow lumps, a swelling around the shoulder jaw and the flank paw, the whole thing sagging under its own weight
  const jt = (W.jaw[2] - Z0) / (Z1 - Z0), ja = Math.atan2(W.jaw[0], W.jaw[1] - cy);
  const at = (W.arm[2] - Z0) / (Z1 - Z0), aa = Math.atan2(W.arm[0], W.arm[1] - cy);
  const ad = (x: number, y: number) => { let d = x - y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const bump = 0.065 * Math.sin(3 * a + 7 * t + v * 2) + 0.045 * Math.sin(5 * a - 11 * t + v) + 0.03 * Math.sin(9 * a + 17 * t)
    + 0.1 * gauss(t, jt, 0.07) * gauss(ad(a, ja), 0, 0.45) + 0.1 * gauss(t, at, 0.08) * gauss(ad(a, aa), 0, 0.5);
  const down = Math.max(0, -Math.cos(a));
  let x = Math.sin(a) * rx * (1 + bump) * (1 + 0.42 * down * down) * k;
  let y = cy + Math.cos(a) * ry * (1 + bump) * k;
  let zz = z;
  // the puddle: whatever reaches the floor spreads out over it in a lip
  if (y < 0.13) {
    const s = (0.13 - y);
    const r = Math.hypot(x, z - (Z0 + Z1) / 2 * 0) || 1;
    x += (x / r) * s * 1.7;
    zz += t < 0.15 ? -s * 0.8 : t > 0.9 ? s * 0.5 : 0;
    y = Math.max(0.012, 0.012 + (y - 0.012) * 0.25);
  }
  return [x, y, zz];
}

// ------------------------------------------------------------------ skeleton
function bonesG(v: number): BoneSpec[] {
  const W = WRONG[v], tl = W.tilt;
  const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const fore = add(W.arm, W.armDir), jawLow = add(W.jaw, [0, -0.045, 0]);
  const head: V3 = [0.1 * tl, 0.54, 0.62];
  const A: [string, string, V3, boolean?][] = [
    ['base', '', [0, 0, 0]],
    ['core', 'base', [0, 0.42, 0]],
    ['front', 'core', [0, 0.44, 0.26]],
    ['rear', 'core', [0, 0.4, -0.3]],
    ['waist', 'core', [0, 0.42, 0]],
    ['gT', 'core', [0, 0.78, -0.04]],
    ['gut', 'core', [0, 0.36, 0.0]],
    ['heart', 'front', [0.03, 0.47, 0.2]],
    ['gF', 'front', [0, 0.44, 0.56]],
    ['gFL', 'front', [0.36, 0.4, 0.26]],
    ['gFR', 'front', [-0.36, 0.4, 0.26]],
    ['gB', 'rear', [0, 0.38, -0.66]],
    ['gRL', 'rear', [0.42, 0.34, -0.3]],
    ['gRR', 'rear', [-0.42, 0.34, -0.3]],
    ['neck', 'front', [0.08 * tl, 0.54, 0.48], true],
    ['head', 'neck', head, true],
    ['jaw', 'head', add(head, [0, -0.065, 0.03]), true],
    ['ear', 'head', add(head, [0.1 * tl, 0.105, -0.04]), true],
    ['eyeL', 'head', add(head, [0.056, 0.045 - (tl > 0 ? 0 : 0.02), 0.085])],
    ['eyeR', 'head', add(head, [-0.056, 0.045 - (tl > 0 ? 0.02 : 0), 0.085])],
    ['armL', 'front', [0.26, 0.28, 0.42], true], ['foreL', 'armL', [0.3, 0.13, 0.48]], ['pawL', 'foreL', [0.31, 0.035, 0.53]],
    ['armR', 'front', [-0.26, 0.28, 0.42], true], ['foreR', 'armR', [-0.3, 0.13, 0.48]], ['pawR', 'foreR', [-0.31, 0.035, 0.53]],
    ['sideArm', W.arm[2] > -0.06 ? 'front' : 'rear', W.arm, true], ['sideFore', 'sideArm', fore], ['sidePaw', 'sideFore', add(fore, W.armDir, 0.75)],
    ['sjaw', W.jaw[2] > -0.06 ? 'front' : 'rear', W.jaw, true], ['sjawLow', 'sjaw', jawLow],
    ['hip', 'rear', W.hip, true], ['hshin', 'hip', add(W.hip, [0, -0.11, -0.16])], ['hfoot', 'hshin', add(W.hip, [0, -0.185, -0.3])],
    ['dripA', 'jaw', add(head, [0, -0.11, 0.1])], ['dripB', 'sideFore', add(fore, [0, -0.075, 0])], ['dripC', 'sjawLow', add(jawLow, [0, -0.035, 0])],
  ];
  const abs = new Map<string, V3>();
  return A.map(([name, parent, p, cap]) => {
    abs.set(name, p);
    const q = parent ? abs.get(parent)! : [0, 0, 0];
    return { name, parent, at: [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cap };
  });
}

const LOBES = ['gF', 'gFL', 'gFR', 'gB', 'gRL', 'gRR', 'gT'] as const;
/** jelly weights: smooth gaussian falloff to the spring lobes, plus the waist band the fission pinches */
function gelW(x: BuildCtx, p: V3, waist = true): Wt {
  const c: [number, number][] = LOBES.map((n) => { const r = x.rest(n); const d2 = (p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2 + (p[2] - r[2]) ** 2; return [x.bi(n), Math.exp(-d2 / (2 * 0.3 * 0.3))]; });
  if (waist) c.push([x.bi('waist'), 1.6 * gauss(p[2], 0, 0.12)]);
  c.sort((a, b) => b[1] - a[1]);
  const top = c.slice(0, 4), tot = top.reduce((s, q) => s + q[1], 0) || 1;
  return top.flatMap(([i, w]) => [i, w / tot]);
}

// ------------------------------------------------------------------ the opaque bear inside (and sticking out)
function layoutG(p: Page) {
  p.reg('FUR', 64, 48); p.reg('FUR2', 32, 32); p.reg('MUZZLE', 48, 32); p.reg('SKIN', 32, 16); p.reg('GUM', 16, 16); p.reg('TOOTH', 8, 8); p.reg('CLAW', 8, 8); p.reg('EYE', 8, 8); p.reg('NOSE', 8, 8); p.reg('PAD', 16, 16); p.reg('CAP', 8, 8);
}

/** an open fur island riding the jelly surface: raised in the middle, sinking under the gel at its ragged edges */
function furIsland(B: SkinB, x: BuildCtx, reg: Region, g: number, t0: number, t1: number, a0: number, a1: number, seed: number) {
  const v = x.variant, NR = 7, NA = 9;
  const us = usFor(NA);
  const rings: { pts: V3[]; v: number; w: (p: V3) => Wt }[] = [];
  for (let i = 0; i <= NR; i++) {
    const u = i / NR, t = t0 + (t1 - t0) * u;
    const pts: V3[] = [];
    for (let j = 0; j <= NA; j++) {
      const w = j / NA, a = a0 + (a1 - a0) * w;
      const edge = Math.sin(Math.PI * u) * Math.sin(Math.PI * w);
      const rag = (hash(i * 13 + j, seed) - 0.5) * 0.05;
      const clump = hash(i * 7 + j * 3, seed + 5) * 0.05 * edge;
      pts.push(blobAt(t, a, v, 0.975 + Math.min(1, edge * 2.2) * 0.07 + rag * (1 - edge) + clump));
    }
    rings.push({ pts, v: 1 - u, w: (p) => gelW(x, p) });
  }
  B.loft(rings, us, reg, g, { double: true });
}

/**
 * Fur growing back through the jelly: wet, matted clumps rooted just under the gel surface, combed flat along the
 * body (nose to tail, and down the flanks), hugging its contours, with a longer shaggy fringe hanging from the belly
 * and the nape. Where it is thin or torn away (a slow noise over the body, different for every individual) the
 * bare red candy shows through, and the head is left clear so the face, the ear and the muzzle still read.
 */
function furClumps(B: SkinB, x: BuildCtx, reg: Region, g: number, seed: number) {
  const v = x.variant, NT = 28, NA = 24;
  for (let i = 0; i < NT; i++) for (let j = 0; j < NA; j++) {
    const h1 = hash(i * 31 + j, seed), h2 = hash(j * 17 + i, seed + 3), h3 = hash(i + j * 7, seed + 9);
    const t = 0.05 + (i + 0.2 + h1 * 0.6) / NT * 0.78, a = -2.5 + (j + h2) / NA * 5.0;
    // torn and thin patches: the gummy shows through (about half the body)
    const cover = 0.5 + 0.3 * Math.sin(3 * a + 5 * t + v * 1.7) + 0.22 * Math.sin(7 * a - 9 * t + v * 2.3) + 0.18 * Math.sin(2 * a + 13 * t + v) + (h3 - 0.5) * 0.3;
    if (cover < 0.5) continue;
    const belly = Math.abs(a) > 1.85, nape = t > 0.64 && Math.abs(a) < 0.9;
    const base = blobAt(t, a, v, 0.985), o = blobAt(t, a, v, 1.1);
    const n: V3 = [o[0] - base[0], o[1] - base[1], o[2] - base[2]], nl = Math.hypot(n[0], n[1], n[2]) || 1;
    n[0] /= nl; n[1] /= nl; n[2] /= nl;
    // combed: back toward the tail, more downward the further round the flank; the fringe hangs
    const side = Math.abs(Math.sin(a));
    const comb: V3 = belly ? [Math.sign(a) * 0.15, -1, -0.35] : [(h2 - 0.5) * 0.2, -0.2 - 0.55 * side, -1];
    const dn = comb[0] * n[0] + comb[1] * n[1] + comb[2] * n[2];
    const tg: V3 = [comb[0] - n[0] * dn, comb[1] - n[1] * dn, comb[2] - n[2] * dn], tl = Math.hypot(tg[0], tg[1], tg[2]) || 1;
    tg[0] /= tl; tg[1] /= tl; tg[2] /= tl;
    const L = (0.045 + 0.04 * h3) * (belly ? 2.3 : nape ? 1.8 : 1), wd = (0.75 + h1 * 0.5) * (belly ? 0.8 : 1);
    const lift = belly ? 0.35 : 0.1; // the fringe stands off and hangs; the coat lies flat
    const at = (k: number, oo: number): V3 => [base[0] + tg[0] * L * k + n[0] * L * oo, base[1] + tg[1] * L * k + n[1] * L * oo, base[2] + tg[2] * L * k + n[2] * L * oo];
    const w = gelW(x, base);
    sac(B, reg, g, [base, at(0.35, lift), at(0.7, lift * 0.9), at(1, lift * 0.5)], [[0.032 * wd, 0.011], [0.027 * wd, 0.01], [0.015 * wd, 0.007], [0.003, 0.002]], [w, w, w, w], { n: 5, up: n });
  }
}

/** a lofted limb with a furry cuff where it comes out of the jelly */
function cuff(B: SkinB, x: BuildCtx, reg: Region, g: number, bone: string, child: string, r0: number, seed: number) {
  const a = x.rest(bone), b = x.rest(child);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1;
  const pt = (s: number): V3 => [a[0] + (d[0] / L) * s, a[1] + (d[1] / L) * s, a[2] + (d[2] / L) * s];
  const w: Wt = [x.bi(bone), 1];
  sac(B, reg, g, [pt(-0.05), pt(0.0), pt(0.05), pt(0.09)], [[r0 * 0.9, r0 * 0.9], [r0 * 1.25, r0 * 1.2], [r0 * 1.15, r0 * 1.1], [r0 * 0.95, r0 * 0.95]], [w, w, w, w],
    { n: 12, bump: (aa, t) => (hash(Math.round(aa * 4), Math.round(t * 6) + seed) - 0.5) * 0.35 * Math.sin(Math.PI * t), start: false, end: false });
}

/** a bear paw: flat leathery pad, a fringe of fur, five dark claws */
function paw(B: SkinB, x: BuildCtx, R: (n: string) => Region, g: number, bone: string, dir: V3, up: V3, size: number, curl: number) {
  const p = x.rest(bone), w: Wt = [x.bi(bone), 1];
  const L = Math.hypot(dir[0], dir[1], dir[2]) || 1, D: V3 = [dir[0] / L, dir[1] / L, dir[2] / L];
  const at = (s: number, h = 0): V3 => [p[0] + D[0] * s + up[0] * h, p[1] + D[1] * s + up[1] * h, p[2] + D[2] * s + up[2] * h];
  sac(B, R('FUR2'), g, [at(-0.05 * size, 0.01), at(0.01 * size, 0.012), at(0.07 * size, 0.008), at(0.11 * size, 0.0)], [[0.07 * size, 0.04 * size], [0.085 * size, 0.045 * size], [0.075 * size, 0.035 * size], [0.035 * size, 0.018 * size]], [w, w, w, w], { n: 10, up });
  sac(B, R('PAD'), g + 1, [at(0.0, -0.022 * size), at(0.06 * size, -0.02 * size), at(0.09 * size, -0.014 * size)], [[0.05 * size, 0.012 * size], [0.06 * size, 0.014 * size], [0.03 * size, 0.01 * size]], [w, w, w], { n: 8, up });
  // claws across the front edge
  const side: V3 = [D[1] * up[2] - D[2] * up[1], D[2] * up[0] - D[0] * up[2], D[0] * up[1] - D[1] * up[0]];
  for (let i = 0; i < 5; i++) {
    const s = (i - 2) / 2;
    const r0 = at(0.1 * size - Math.abs(s) * 0.02 * size, -0.004);
    const b: V3 = [r0[0] + side[0] * s * 0.055 * size, r0[1] + side[1] * s * 0.055 * size, r0[2] + side[2] * s * 0.055 * size];
    const c1: V3 = [b[0] + D[0] * 0.035 * size, b[1] + D[1] * 0.035 * size, b[2] + D[2] * 0.035 * size];
    const c2: V3 = [c1[0] + D[0] * 0.02 * size - up[0] * 0.03 * size * curl, c1[1] + D[1] * 0.02 * size - up[1] * 0.03 * size * curl, c1[2] + D[2] * 0.02 * size - up[2] * 0.03 * size * curl];
    sac(B, R('CLAW'), g + 2 + i, [b, c1, c2], [[0.011 * size, 0.009 * size], [0.008 * size, 0.006 * size], [0.0015, 0.0015]], [w, w, w], { n: 5 });
  }
}

/** a gum ridge with a row of teeth (up = the way the teeth point) */
function teethRow(B: SkinB, x: BuildCtx, R: (n: string) => Region, g: number, bone: string, c: V3, out: V3, along: V3, up: V3, span: number, n: number, big: number[], seed: number, ts = 1) {
  const w: Wt = [x.bi(bone), 1];
  const arc = (s: number, h = 0, o = 0): V3 => {
    const bulge = 0.045 * ts * (1 - s * s) + o;
    return [c[0] + along[0] * s * span + out[0] * bulge + up[0] * h, c[1] + along[1] * s * span + out[1] * bulge + up[1] * h, c[2] + along[2] * s * span + out[2] * bulge + up[2] * h];
  };
  const pts: V3[] = [], rr: [number, number][] = [], ws: Wt[] = [];
  for (let i = 0; i <= 8; i++) { const s = -1 + i / 4; pts.push(arc(s)); rr.push([0.016 * ts, 0.02 * ts]); ws.push(w); }
  sac(B, R('GUM'), g, pts, rr, ws, { n: 6, up });
  for (let i = 0; i < n; i++) {
    const s = -0.9 + (1.8 * i) / Math.max(1, n - 1);
    const L = (big.includes(i) ? 0.05 : 0.022 + hash(i, seed) * 0.012) * ts;
    const b = arc(s, 0.008, 0.004);
    const tip: V3 = [b[0] + up[0] * L + out[0] * L * 0.15, b[1] + up[1] * L + out[1] * L * 0.15, b[2] + up[2] * L + out[2] * L * 0.15];
    const mid: V3 = [(b[0] + tip[0]) / 2, (b[1] + tip[1]) / 2, (b[2] + tip[2]) / 2];
    sac(B, R('TOOTH'), g + 1 + i, [b, mid, tip], [[(big.includes(i) ? 0.011 : 0.008) * ts, 0.008 * ts], [(big.includes(i) ? 0.008 : 0.006) * ts, 0.006 * ts], [0.0012, 0.0012]], [w, w, w], { n: 5 });
  }
}

function buildG(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, v = x.variant, W = WRONG[v], tl = W.tilt;
  const rest = x.rest;
  // ================= fur islands floating on the jelly (real, wet bear fur)
  W.fur.forEach(([t0, t1, a0, a1], i) => furIsland(B, x, R(i % 2 ? 'FUR2' : 'FUR'), 20 + i, t0, t1, a0, a1, 31 + i * 7 + v));
  // ...and the coat growing back through the jelly everywhere else, wet and clumped
  furClumps(B, x, R('FUR2'), 95, 101 + v);

  // ================= the head: a bear's, slid forward and sideways and half sunk in the front of the blob
  const H = rest('head');
  const hw: Wt = [bi('head'), 1], nw: Wt = [bi('neck'), 0.6, bi('head'), 0.4];
  const hz = [-0.11, -0.05, 0.02, 0.08, 0.14, 0.19, 0.22], hr: [number, number][] = [[0.09, 0.085], [0.135, 0.12], [0.13, 0.112], [0.095, 0.085], [0.068, 0.06], [0.052, 0.046], [0.02, 0.018]];
  const hy = [0.02, 0.025, 0.02, 0.0, -0.022, -0.032, -0.036];
  sac(B, R('MUZZLE'), 30, hz.map((z, i) => [H[0], H[1] + hy[i], H[2] + z]), hr, hz.map((_, i) => (i === 0 ? nw : hw)), {
    n: 14, up: [0, 1, 0],
    // a brow ridge, cheeks, and one side of the face run down like wax
    bump: (a, t) => 0.12 * gauss(t, 0.42, 0.08) * gauss(a, 0, 0.6) + 0.08 * gauss(t, 0.3, 0.1) * gauss(Math.abs(a), 1.6, 0.4)
      - 0.1 * gauss(t, 0.5, 0.15) * gauss(a, -tl * 2.2, 0.5) + 0.14 * gauss(t, 0.35, 0.15) * gauss(a, -tl * 2.6, 0.4),
  });
  // nose leather
  sac(B, R('NOSE'), 31, [[H[0], H[1] - 0.03, H[2] + 0.205], [H[0], H[1] - 0.028, H[2] + 0.225], [H[0], H[1] - 0.03, H[2] + 0.24]], [[0.026, 0.02], [0.032, 0.024], [0.012, 0.01]], [hw, hw, hw], { n: 8 });
  // eyes, deep under the brow (one lower than the other)
  for (const e of ['eyeL', 'eyeR']) {
    const p = rest(e), ew: Wt = [bi(e), 1];
    sac(B, R('EYE'), 32, [[p[0], p[1], p[2] - 0.012], [p[0], p[1], p[2]], [p[0], p[1], p[2] + 0.01]], [[0.008, 0.008], [0.016, 0.015], [0.006, 0.006]], [ew, ew, ew], { n: 8 });
  }
  // the one ear (round, cupped); where the other was, a melted nub
  const ep = rest('ear'), ew: Wt = [bi('ear'), 1];
  sac(B, R('FUR2'), 33, [[ep[0], ep[1] - 0.02, ep[2]], [ep[0] + 0.01 * tl, ep[1] + 0.02, ep[2]], [ep[0] + 0.015 * tl, ep[1] + 0.05, ep[2] - 0.005]], [[0.035, 0.012], [0.045, 0.016], [0.02, 0.01]], [ew, ew, ew], { n: 8, up: [0, 0, 1] });
  sac(B, R('SKIN'), 34, [[H[0] - 0.09 * tl, H[1] + 0.07, H[2] - 0.05], [H[0] - 0.1 * tl, H[1] + 0.09, H[2] - 0.05]], [[0.025, 0.02], [0.012, 0.01]], [hw, hw], { n: 6 });
  // lower jaw with its teeth; upper teeth under the muzzle
  const J = rest('jaw'), jw: Wt = [bi('jaw'), 1];
  sac(B, R('MUZZLE'), 35, [[J[0], J[1], J[2] - 0.04], [J[0], J[1] - 0.012, J[2] + 0.04], [J[0], J[1] - 0.004, J[2] + 0.12], [J[0], J[1] + 0.004, J[2] + 0.16]], [[0.07, 0.03], [0.06, 0.03], [0.042, 0.022], [0.02, 0.012]], [jw, jw, jw, jw], { n: 10 });
  teethRow(B, x, R, 36, 'jaw', [J[0], J[1] + 0.022, J[2] + 0.1], [0, 0, 1], [1, 0, 0], [0, 1, 0], 0.035, 6, [0, 5], 3);
  teethRow(B, x, R, 44, 'head', [H[0], H[1] - 0.05, H[2] + 0.15], [0, 0, 1], [1, 0, 0], [0, -1, 0], 0.035, 6, [0, 5], 4);

  // ================= front legs: thick, furred, half dissolved, pulling the blob along
  for (const [s, k] of SIDES) {
    chain(B, x, R('FUR'), 52, { bones: ['arm' + s, 'fore' + s, 'paw' + s], tip: [rest('paw' + s)[0], 0.03, rest('paw' + s)[2] + 0.05], r: (t) => 0.1 - t * 0.035, n: 10, rings: 3, knuckle: 0.15,
      bump: (a, t) => (hash(Math.round(a * 4), Math.round(t * 12) + k) - 0.5) * 0.18 });
    cuff(B, x, R('FUR2'), 53, 'arm' + s, 'fore' + s, 0.11, 7 + k);
    paw(B, x, R, 54, 'paw' + s, [0.0, 0, 1], [0, 1, 0], 1.0, 1);
  }
  // ================= the paw out of its flank: the wrong arm, clawing at nothing
  chain(B, x, R('FUR'), 62, { bones: ['sideArm', 'sideFore', 'sidePaw'], tipLen: 0.04, r: (t) => 0.085 - t * 0.03, n: 10, rings: 3, knuckle: 0.2,
    bump: (a, t) => (hash(Math.round(a * 4), Math.round(t * 12) + 9) - 0.5) * 0.2 - (t > 0.3 && t < 0.55 && a > 0 ? 0.08 : 0) });
  cuff(B, x, R('FUR2'), 63, 'sideArm', 'sideFore', 0.1, 11);
  { const sp2 = rest('sidePaw'), f2 = rest('sideFore'); const d: V3 = [sp2[0] - f2[0], sp2[1] - f2[1], sp2[2] - f2[2]]; const up: V3 = Math.abs(d[1]) > 0.7 * Math.hypot(d[0], d[1], d[2]) ? [0, 0, 1] : [0, 1, 0]; paw(B, x, R, 64, 'sidePaw', d, up, 0.9, 1.6); }
  // ================= a jaw where a shoulder should be
  {
    const c = rest('sjaw'), out: V3 = [Math.sign(c[0]) || 1, 0.25, 0.1], ol = Math.hypot(out[0], out[1], out[2]);
    const O: V3 = [out[0] / ol, out[1] / ol, out[2] / ol], along: V3 = [0, 0, 1];
    teethRow(B, x, R, 70, 'sjaw', c, O, along, [0, -1, 0], 0.085, 8, [0, 7], 11, 1.5);
    const lo = rest('sjawLow');
    teethRow(B, x, R, 80, 'sjawLow', lo, O, along, [0, 1, 0], 0.075, 7, [0, 6], 12, 1.5);
    // lips of bald, wet skin around it, and a tongue lolling out of the lower jaw
    const lw: Wt = [bi('sjawLow'), 1];
    sac(B, R('SKIN'), 88, [[lo[0], lo[1] - 0.01, lo[2] - 0.065], [lo[0] + O[0] * 0.04, lo[1] - 0.018, lo[2]], [lo[0], lo[1] - 0.01, lo[2] + 0.065]], [[0.022, 0.018], [0.03, 0.02], [0.022, 0.018]], [lw, lw, lw], { n: 8 });
    sac(B, R('GUM'), 89, [[lo[0] + O[0] * 0.01, lo[1] + 0.005, lo[2]], [lo[0] + O[0] * 0.05, lo[1] - 0.005, lo[2] + 0.01], [lo[0] + O[0] * 0.08, lo[1] - 0.035, lo[2] + 0.015]], [[0.025, 0.01], [0.024, 0.009], [0.012, 0.006]], [lw, lw, lw], { n: 7 });
  }
  // ================= the one hind leg, dragged behind, foot turned pads-up
  chain(B, x, R('FUR'), 90, { bones: ['hip', 'hshin', 'hfoot'], tipLen: 0.05, r: (t) => 0.1 - t * 0.04, n: 10, rings: 3, knuckle: 0.15, bump: (a, t) => (hash(Math.round(a * 4), Math.round(t * 12) + 5) - 0.5) * 0.18 });
  paw(B, x, R, 91, 'hfoot', [0, -0.15, -1], [0, -1, 0], 1.05, 0.6);
}


// ------------------------------------------------------------------ what shows through the jelly (drawn without ink lines)
function layoutI(p: Page) { p.reg('BONE', 32, 16); p.reg('ORGAN', 32, 32); p.reg('GUT', 32, 16); p.reg('CAP', 8, 8); }
function buildI(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, v = x.variant, tl = WRONG[v].tilt;
  const rest = x.rest;
  // spine, ribs, pelvis, a loose femur, heart, lungs, stomach, coils of gut
  const sp: V3[] = [[0.06 * tl, 0.55, 0.5], [0.02, 0.56, 0.3], [0, 0.55, 0.1], [0, 0.53, -0.1], [0, 0.5, -0.3], [0, 0.46, -0.48], [0, 0.42, -0.62]];
  const spW: Wt[] = [[bi('neck'), 1], [bi('front'), 1], [bi('front'), 0.5, bi('waist'), 0.5], [bi('waist'), 0.4, bi('rear'), 0.6], [bi('rear'), 1], [bi('rear'), 1], [bi('rear'), 1]];
  sac(B, R('BONE'), 1, sp, sp.map(() => [0.03, 0.034] as [number, number]), spW, { n: 7, bump: (a, t) => Math.pow(Math.abs(Math.sin(t * Math.PI * 16)), 3) * 0.6 + (Math.abs(a) < 0.6 ? 0.4 : 0) });
  for (let i = 0; i < 6; i++) {
    const z = 0.32 - i * 0.085, wR: Wt = z > 0.05 ? [bi('front'), 1] : [bi('waist'), 0.5, bi('front'), 0.5];
    for (const [, k] of SIDES) {
      const sag = 1 - i * 0.04, j0 = (q: number) => (hash(i * 5 + q, k + v * 3) - 0.5) * 0.05;
      let pts: V3[] = [[0.02 * k, 0.55, z], [0.15 * k + j0(1), 0.56, z - 0.01 + j0(2)], [0.27 * k * sag + j0(3), 0.48, z - 0.02 + j0(4)], [0.31 * k * sag + j0(5), 0.36 + j0(6), z - 0.02 + j0(7)], [0.25 * k * sag, 0.24 + j0(8), z + j0(9)], [0.12 * k, 0.19, z + 0.03]];
      // some have softened and snapped, the ends drifting
      if (hash(i, k + 7 + v) < 0.3) pts = pts.slice(0, 3 + Math.floor(hash(i, k + 9) * 2));
      sac(B, R('BONE'), 2 + i, pts, pts.map((_, j) => [0.014 - j * 0.0012, 0.016 - j * 0.0012] as [number, number]), pts.map(() => wR), { n: 5 });
    }
  }
  // pelvis: a cracked bony shield across the rear
  sac(B, R('BONE'), 9, [[-0.17, 0.4, -0.46], [-0.08, 0.44, -0.5], [0.08, 0.44, -0.5], [0.17, 0.4, -0.46]], [[0.04, 0.03], [0.07, 0.025], [0.07, 0.025], [0.04, 0.03]], [[bi('rear'), 1], [bi('rear'), 1], [bi('rear'), 1], [bi('rear'), 1]], { n: 6 });
  // the other hind leg's femur, adrift
  const fm: V3[] = [[-0.16 * tl * -1, 0.3, -0.42], [-0.18 * tl * -1, 0.26, -0.28], [-0.19 * tl * -1, 0.22, -0.14]];
  sac(B, R('BONE'), 10, fm, [[0.03, 0.03], [0.016, 0.016], [0.028, 0.026]], fm.map((p) => gelW(x, p)), { n: 6 });
  // heart, lungs
  const hp = rest('heart');
  sac(B, R('ORGAN'), 11, [[hp[0], hp[1] + 0.05, hp[2]], [hp[0], hp[1], hp[2] + 0.01], [hp[0] - 0.01, hp[1] - 0.05, hp[2] + 0.02]], [[0.03, 0.03], [0.055, 0.05], [0.02, 0.02]], [[bi('heart'), 1], [bi('heart'), 1], [bi('heart'), 1]], { n: 8, bump: (a) => Math.sin(a * 3) * 0.1 });
  for (const [, k] of SIDES) {
    const l: V3[] = [[0.11 * k, 0.5, 0.32], [0.14 * k, 0.45, 0.2], [0.13 * k, 0.4, 0.06]];
    sac(B, R('ORGAN'), 12, l, [[0.04, 0.04], [0.075, 0.08], [0.04, 0.045]], l.map((p) => gelW(x, p)), { n: 8, bump: (a, t) => Math.sin(a * 5 + t * 9) * 0.08 });
  }
  // stomach: a dark sac around the gut point (what it eats sits in here, seen through two jellies)
  const gp = rest('gut');
  sac(B, R('GUT'), 13, [[gp[0] + 0.05, gp[1] + 0.02, gp[2] + 0.2], [gp[0], gp[1], gp[2] + 0.08], [gp[0] - 0.02, gp[1] - 0.02, gp[2] - 0.08], [gp[0], gp[1] + 0.01, gp[2] - 0.2]],
    [[0.03, 0.03], [0.1, 0.085], [0.11, 0.09], [0.04, 0.035]], [[bi('front'), 1], [bi('gut'), 1], [bi('gut'), 1], [bi('waist'), 0.5, bi('rear'), 0.5]], { n: 10, bump: (a, t) => Math.sin(a * 2 + t * 7) * 0.08 });
  // coils of gut in the rear: a wandering tube
  const coil: V3[] = [];
  for (let i = 0; i <= 22; i++) { const u = i / 22, a = u * Math.PI * 5.5; coil.push([Math.cos(a) * (0.13 - u * 0.03), 0.26 + Math.sin(a) * 0.06 + u * 0.05, -0.18 - u * 0.32 + Math.sin(a * 0.5) * 0.04]); }
  sac(B, R('GUT'), 14, coil, coil.map(() => [0.024, 0.022] as [number, number]), coil.map((p) => gelW(x, p, false)), { n: 6 });

}

// ------------------------------------------------------------------ painting
function paintFur(r: Region, R: number[], o: { seed: number; wet?: number; bald?: number; skin?: number[] }) {
  const seed = o.seed;
  r.fill(R, (xx, yy) => {
    const th = (r.deg(xx) * Math.PI) / 180;
    const clump = r.fbm(xx, yy, 4, 2, seed);
    const col = Math.floor(xx / 2);
    const strand = ((yy + Math.floor(hash(col, seed) * 7)) % 7) / 7;
    return R.length * 0.4 + Math.cos(th) * 0.55 + (clump - 0.5) * 1.3 + strand * 0.9 - 0.45 + (hash(xx, yy + seed) - 0.5) * 0.5;
  }, undefined, 0.55);
  // wet, matted locks: dark partings and glints
  for (let i = 0; i < 10; i++) r.crack(hash(i, seed) * r.w, hash(i + 3, seed) * r.h, 6 + Math.floor(hash(i, seed + 2) * 10), 80 + hash(i + 5, seed) * 30, R[0], seed * 7 + i, 0.6, 0.2);
  for (let i = 0; i < (o.wet ?? 12); i++) { const gx = hash(i, seed + 40) * r.w, gy = hash(i + 2, seed + 40) * r.h; r.blend(gx, gy, 0xfff0d8, 0.6); r.blend(gx, gy + 1, R[R.length - 2], 0.5); }
  // bald patches where the fur slid off: grey-pink wet hide
  if (o.bald && o.skin) for (let i = 0; i < o.bald; i++) r.blob(hash(i, seed + 61) * r.w, hash(i + 4, seed + 61) * r.h, 1.5 + hash(i, 7) * 2, 1.5 + hash(i, 8) * 2, o.skin[Math.floor(o.skin.length / 2)], 1.1);
}
function paintG(p: Page, x: BuildCtx) {
  const v = x.variant;
  const furC = [0x5c3c22, 0x4a3020, 0x6a4628][v % 3];
  const FUR = makeRamp(furC, 7, { hueShift: 0.04, spread: 0.45 }), SK = makeRamp(0x7a5a58, 5, { spread: 0.45 });
  paintFur(p.R('FUR'), FUR, { seed: 3 + v, bald: 2, skin: SK });
  paintFur(p.R('FUR2'), makeRamp(mixHex(furC, 0x2a1a10, 0.3), 7, { hueShift: 0.04, spread: 0.45 }), { seed: 9 + v, wet: 20, bald: 1, skin: SK });
  // the face: fur, a paler muzzle toward the nose (bottom rows), a dark mouth line underneath
  const mz = p.R('MUZZLE');
  paintFur(mz, FUR, { seed: 17 + v });
  const TAN = makeRamp(mixHex(furC, 0xc8a070, 0.55), 6, { spread: 0.5 });
  for (let yy = 0; yy < mz.h; yy++) for (let xx = 0; xx < mz.w; xx++) {
    const f = yy / mz.h, th = (mz.deg(xx) * Math.PI) / 180;
    if (f > 0.55 + hash(xx, 3) * 0.08) mz.put(xx, yy, TAN, 2.6 + Math.cos(th) * 0.8 + (hash(xx, yy) - 0.5) * 0.8, 0.5);
    if (f > 0.5 && Math.abs(Math.abs(th) - Math.PI) < 0.35) mz.blend(xx, yy, 0x2a1418, 0.7);
  }
  const sk = p.R('SKIN');
  sk.fill(SK, (xx, yy) => 2 + (sk.fbm(xx, yy, 3, 2, 4) - 0.5) * 1.6 + Math.cos((sk.deg(xx) * Math.PI) / 180) * 0.6);
  for (let i = 0; i < 8; i++) sk.blend(hash(i, 3) * sk.w, hash(i, 4) * sk.h, 0xffffff, 0.5);
  const gm = p.R('GUM');
  gm.fill(makeRamp(0x9a3a48, 5, { spread: 0.5 }), (xx, yy) => 2 + (hash(xx, yy) - 0.5) + Math.cos((gm.deg(xx) * Math.PI) / 180) * 0.7);
  for (let i = 0; i < 6; i++) gm.blob(hash(i, 1) * gm.w, hash(i, 2) * gm.h, 1.5, 1.2, 0x2a1418, 0.9);
  p.R('TOOTH').fill(makeRamp(0xe0d4a8, 4, { spread: 0.4 }), (xx, yy) => 2.4 - yy * 0.12 + (hash(xx, yy) - 0.5) * 0.6);
  p.R('CLAW').fill(makeRamp(0x2a2420, 4), (xx, yy) => 1.4 + (xx === 3 ? 1.5 : 0) - yy * 0.08);
  paintEye(p.R('EYE'), 0x3a2410, 0x0a0604, 0x1a1008);
  const ns = p.R('NOSE');
  ns.fill(makeRamp(0x1a1614, 4), (xx, yy) => 1.2 + (hash(xx * 3, yy * 3) - 0.5) * 0.9 + (yy < 3 ? 0.8 : 0)); ns.set(3, 2, 0xd0d0d0);
  const pd = p.R('PAD');
  pd.fill(makeRamp(0x2a2624, 5), (xx, yy) => 1.6 + (hash(xx * 2, yy * 2) - 0.5) * 1.2 + Math.cos((pd.deg(xx) * Math.PI) / 180) * 0.5);
  paintCap(p.R('CAP'), 0xc8502a, 0xe07040, 0x6a1a10);
}
function paintI(p: Page) {
  // bone: old ivory, pitted, stained by the gel
  const bo = p.R('BONE');
  bo.fill(makeRamp(0xe0d0b0, 5, { spread: 0.45 }), (xx, yy) => 2.6 + Math.cos((bo.deg(xx) * Math.PI) / 180) * 0.8 + (bo.fbm(xx, yy, 3, 2, 6) - 0.5) * 1.4 - (hash(xx * 3, yy) < 0.06 ? 1.2 : 0));
  // organs: dark liver-red, glossy, veined
  const og = p.R('ORGAN');
  og.fill(makeRamp(0x8a2a2a, 6, { spread: 0.6 }), (xx, yy) => 2.6 + Math.cos((og.deg(xx) * Math.PI) / 180) * 0.9 + (og.fbm(xx, yy, 3, 3, 8) - 0.5) * 1.8);
  for (let i = 0; i < 6; i++) og.crack(hash(i, 2) * og.w, hash(i, 5) * og.h, 14, 90, 0x3a0a14, i + 4, 0.6, 0.25);
  for (let i = 0; i < 10; i++) og.blend(hash(i, 9) * og.w, hash(i, 10) * og.h, 0xffd0c8, 0.6);
  const gt = p.R('GUT');
  gt.fill(makeRamp(0x9a5a48, 6, { spread: 0.55 }), (xx, yy) => 2.4 + Math.cos((gt.deg(xx) * Math.PI) / 180) * 0.8 + Math.sin(yy * 1.3) * 0.5 + (gt.fbm(xx, yy, 2, 2, 3) - 0.5) * 1.2);
  paintCap(p.R('CAP'), 0xc8a878, 0x9a5a48, 0x6a1a10);
}
const INNER_KIT: KitDef = { key: 'gummy_bear_inner', variants: 3, W: 128, H: 64, bones: bonesG, layout: layoutI, build: buildI, paint: paintI, sphere: [0, 0.45, 0, 1.1] };
export const GUMMY_KIT: KitDef = { key: 'gummy_bear', variants: 3, W: 256, H: 256, bones: bonesG, layout: layoutG, build: buildG, paint: paintG, sphere: [0, 0.45, 0, 1.1],
  decorate: (rig, e) => { attachInner(rig, INNER_KIT, e.variant); attachFilm(rig, GEL_KIT, e.variant, { opacity: 0.3, edge: 1.9, spec: 1.2, rim: 0.3, tint: 1 }); } };

// ------------------------------------------------------------------ the jelly shell (translucent film)
function layoutJ(p: Page) { p.reg('GEL', 64, 48); p.reg('SLEEVE', 32, 16); p.reg('DRIP', 8, 16); p.reg('CAP', 8, 8); }
function buildJ(B: SkinB, x: BuildCtx) {
  const v = x.variant, NR = 26, NA = 22, us = usFor(NA);
  const rings: { pts: V3[]; v: number; w: (p: V3) => Wt }[] = [];
  for (let i = 0; i <= NR; i++) {
    const t = i / NR;
    const pts: V3[] = [];
    for (let j = 0; j <= NA; j++) pts.push(blobAt(t, -Math.PI + (Math.PI * 2 * j) / NA, v));
    pts[NA] = pts[0];
    rings.push({ pts, v: 1 - t, w: (p) => gelW(x, p) });
  }
  const tail = blobAt(0, 0, v, 0), nose = blobAt(1, 0, v, 0);
  B.loft(rings, us, x.R('GEL'), 1, { start: [tail[0], tail[1], Z0 - 0.02], end: [nose[0], nose[1], Z1 + 0.02], startW: gelW(x, [0, 0.4, Z0]), endW: gelW(x, [0, 0.45, Z1]) });
  // jelly sleeves creeping up the limbs and over the back of the skull
  const sleeve = (a: string, b: string, r0: number, r1: number, g: number, back = 0.04, fwd = 0.6) => {
    const A = x.rest(a), Bp = x.rest(b), d = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]];
    const pts: V3[] = [-back, 0, fwd * 0.5, fwd].map((s) => [A[0] + d[0] * s, A[1] + d[1] * s, A[2] + d[2] * s]);
    sac(B, x.R('SLEEVE'), g, pts, [[r0, r0], [r0, r0], [(r0 + r1) / 2, (r0 + r1) / 2], [r1, r1]], [[x.bi(a), 1], [x.bi(a), 1], [x.bi(a), 0.6, x.bi(b), 0.4], [x.bi(b), 1]],
      { n: 10, bump: (aa, t) => Math.sin(aa * 3 + t * 8 + g) * 0.12 * t });
  };
  sleeve('armL', 'foreL', 0.135, 0.1, 2, 0.1, 0.9); sleeve('armR', 'foreR', 0.135, 0.1, 3, 0.1, 0.9);
  sleeve('sideArm', 'sideFore', 0.12, 0.085, 4, 0.1, 0.75);
  sleeve('hip', 'hshin', 0.13, 0.1, 5, 0.1, 0.8);
  sleeve('neck', 'head', 0.16, 0.15, 6, 0.0, 0.55);
  // drips: teardrops of jelly hanging off the chin, the flank arm and the shoulder jaw (they stretch, fall, regrow)
  for (const d of ['dripA', 'dripB', 'dripC']) {
    const p = x.rest(d), w: Wt = [x.bi(d), 1];
    sac(B, x.R('DRIP'), 7, [[p[0], p[1] + 0.03, p[2]], [p[0], p[1], p[2]], [p[0], p[1] - 0.04, p[2]], [p[0], p[1] - 0.07, p[2]]], [[0.012, 0.012], [0.018, 0.018], [0.022, 0.022], [0.004, 0.004]], [w, w, w, w], { n: 8 });
  }
}
function paintJ(p: Page, x: BuildCtx) {
  const v = x.variant;
  const base = [0xc8381a, 0xd04a14, 0xb82e28][v % 3];
  const R = makeRamp(base, 8, { hueShift: 0.06, spread: 0.62 });
  const g = p.R('GEL');
  g.fill(R, (xx, yy) => {
    const th = (g.deg(xx) * Math.PI) / 180;
    // lit from above, dense and dark where it pools underneath, slow cloudy swirls inside
    return 3.2 + Math.cos(th) * 1.1 - (Math.abs(th) > 2.4 ? 0.9 : 0) + (g.fbm(xx, yy, 3, 3, 5 + v) - 0.5) * 1.8 + Math.sin(xx * 0.4 + yy * 0.25) * 0.25;
  }, undefined, 0.3);
  // suspended hairs shed from the fur, drifting in the jelly
  for (let i = 0; i < 70; i++) { const x0 = hash(i, 3 + v) * g.w, y0 = hash(i, 4 + v) * g.h, a = hash(i, 5) * 6.28, L = 2 + hash(i, 6) * 3; g.line(x0, y0, x0 + Math.cos(a) * L, y0 + Math.sin(a) * L, 0x3a1a0a, 0.45); }
  // trapped bubbles: a bright point with a dark rim
  for (let i = 0; i < 18; i++) { const bx = hash(i, 11) * g.w, by = hash(i, 12) * g.h, r = 0.6 + hash(i, 13) * 1.1; g.ellipse(bx, by, r + 0.7, r + 0.7, R[1], 0.4); g.ellipse(bx, by, r, r, R[5], 0.6); g.set(bx - 0.5, by - 0.5, 0xffe8d8); }
  // denser streaks (old blood vessels, gone to syrup)
  for (let i = 0; i < 7; i++) g.crack(hash(i, 21) * g.w, hash(i, 22) * g.h, 18, 90 + hash(i, 23) * 40, R[2], 40 + i, 0.5, 0.18);
  const sl = p.R('SLEEVE');
  sl.fill(R, (xx, yy) => 4.6 + Math.cos((sl.deg(xx) * Math.PI) / 180) * 1.2 + (sl.fbm(xx, yy, 2, 2, 7) - 0.5) * 1.4);
  const dr = p.R('DRIP');
  dr.fill(R, (xx, yy) => 5 + Math.cos((dr.deg(xx) * Math.PI) / 180) * 1.4 - yy * 0.06);
  paintCap(p.R('CAP'), base, mixHex(base, 0xffffff, 0.3), mixHex(base, 0x000000, 0.4));
}
const GEL_KIT: KitDef = { key: 'gummy_bear_gel', variants: 3, W: 128, H: 128, bones: bonesG, layout: layoutJ, build: buildJ, paint: paintJ, sphere: [0, 0.45, 0, 1.1] };

/** a gummy bear rig (opaque bear + jelly shell on one skeleton) */
export function buildGummyBear(variant = 0): KitRig { return buildKitRig(GUMMY_KIT, variant, 0.75); }

// ------------------------------------------------------------------ soft body: spring lobes
const INERT: Record<string, number> = { gF: 0.85, gFL: 1, gFR: 1, gB: 1.3, gRL: 1.1, gRR: 1.1, gT: 1.5 };
interface Spring { o: number[]; v: number[] }
function springs(K: KitRig): Record<string, Spring> {
  return (K.kit.m.sp ??= Object.fromEntries(LOBES.map((n) => [n, { o: [0, 0, 0], v: [0, 0, 0] }]))) as Record<string, Spring>;
}
/** knock the jelly: a velocity kick to every lobe (scaled by its inertia), plus a little noise */
function kick(K: KitRig, v: [number, number, number], spread = 0.3) {
  const S = springs(K);
  for (const n of LOBES) { const s = S[n], k = INERT[n]; for (let i = 0; i < 3; i++) s.v[i] += v[i] * k * (1 + (Math.random() - 0.5) * spread); }
}
function stepSprings(K: KitRig, acc: number[], dt: number, stiff: number, damp: number) {
  const S = springs(K);
  const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
  for (let it = 0; it < n; it++) for (const name of LOBES) {
    const s = S[name], k = INERT[name];
    for (let i = 0; i < 3; i++) {
      s.v[i] += (-stiff * s.o[i] - damp * s.v[i] - acc[i] * k) * h;
      s.o[i] = Math.max(-0.18, Math.min(0.18, s.o[i] + s.v[i] * h));
    }
  }
}

// ------------------------------------------------------------------ the pose
export interface GummyDrive {
  t: number; dt: number; speed: number; phase: number; md: string;
  /** fission progress 0..1 */ fs: number;
  /** digestion 0 (empty) .. 1 (gone) */ prey: number; preyV: number;
  atk: number; dead: number; flinch: number; seed: number; tilt: number;
  /** local acceleration of the body (m/s^2: x left, z forward) */ ax: number; az: number;
}
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
const p0 = (o: THREE.Object3D) => o.userData.p0 as THREE.Vector3;

function poseGummy(K: KitRig, d: GummyDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, dt = d.dt, s9 = d.seed * 9;
  const is = (m: string) => (d.md === m ? 1 : 0);
  const mv = Math.min(1, d.speed / 0.8) * (1 - d.dead);
  const stalk = sm(ud, 'stalk', is('stalk') + is('coil') * 1.2, 4, dt), coil = sm(ud, 'coil', is('coil'), 7, dt), lunge = sm(ud, 'lunge', is('lunge'), 12, dt);
  const engulf = sm(ud, 'eng', is('engulf'), 5, dt), digest = sm(ud, 'dig', is('digest') + (d.prey > 0 && d.md !== 'engulf' ? 0.5 : 0), 1.5, dt);
  const warn = sm(ud, 'warn', is('warn') + d.atk, 5, dt), dead = d.dead;
  const fs = sm(ud, 'fs', d.fs, 6, dt);
  // ---- the gait: both front legs reach and haul together (a galumph), the jelly surging after them in a wave
  ud.gph = (ud.gph ?? s9) + dt * (d.speed * 4.2 + 0.0);
  const ph = ud.gph, haul = Math.sin(ph), haulD = Math.cos(ph);
  if (mv > 0.15 && (ud.lastHaul ?? 0) < 0 && haul >= 0) { kick(K, [0, -0.5 * mv, -0.25 * mv], 0.5); ud.step = 1; }
  ud.lastHaul = haul;
  // ---- springs, driven by how the body accelerates (lobes lag, overshoot, wobble back)
  const acc = [d.ax * 0.9, 0, d.az * 0.9];
  stepSprings(K, acc, dt, 85 - dead * 60 - digest * 20, 5.5 + dead * 6);
  const S = springs(K);
  // idle breathing heave and slow internal churn
  const br = Math.sin(t * 1.3 + s9) * (1 - dead), churn = (q: number) => Math.sin(t * 0.7 + q * 2.1 + s9) * 0.012 * (1 - dead);
  // ---- squash & stretch through the base (it scales about the floor, so the puddle stays put)
  const squash = 1 - 0.07 * mv * Math.max(0, haulD) - 0.1 * stalk - 0.14 * coil + 0.05 * lunge * 0 - dead * 0.42 + br * 0.015 + 0.04 * engulf * Math.sin(t * 9);
  const stretch = 1 + 0.06 * mv * Math.max(0, -haulD) + 0.28 * lunge - 0.1 * coil + 0.1 * engulf;
  const wide = 1 / Math.sqrt(Math.max(0.3, squash * stretch)) * (1 + dead * 0.08);
  const base = P.base;
  base.rotation.set(0, 0, 0); base.position.set(0, 0, 0);
  base.scale.set(wide, squash, stretch);
  // ---- the body halves: a peristaltic wave as it hauls; coiled before a lunge; pulled apart by fission
  const e = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const sep = e((fs - 0.2) / 0.75);
  const fr = P.front, re = P.rear, co = P.core;
  co.position.set(p0(co).x, p0(co).y - 0.07 * stalk - 0.05 * coil, p0(co).z);
  fr.position.set(p0(fr).x, p0(fr).y + 0.02 * lunge, p0(fr).z + 0.05 * haul * mv - 0.08 * coil + 0.18 * lunge + 0.08 * engulf + 0.12 * sep);
  re.position.set(p0(re).x, p0(re).y - 0.02 * sep, p0(re).z + 0.05 * Math.sin(ph - 1.5) * mv + 0.14 * coil - 0.06 * lunge - 0.5 * sep);
  re.rotation.set(0.1 * sep, Math.sin(t * 3) * 0.08 * sep, 0);
  // the waist pinches in (the cleavage furrow), then stretches into a strand
  const pinch = 1 - e(fs / 0.4) * 0.45 - sep * 0.48;
  P.waist.scale.set(Math.max(0.06, pinch + Math.sin(t * 7) * 0.03 * (fs > 0.05 ? 1 : 0)), Math.max(0.06, pinch * (1 + Math.sin(t * 5.3) * 0.04)), 1 + sep * 2.2);
  P.waist.position.set(p0(P.waist).x, p0(P.waist).y - sep * 0.08, p0(P.waist).z - sep * 0.22);
  // lobes: rest + spring + pose
  const lob = (n: string, x: number, y: number, z: number) => { const o = P[n], s = S[n]; o.position.set(p0(o).x + s.o[0] + x, p0(o).y + s.o[1] + y, p0(o).z + s.o[2] + z); };
  lob('gT', churn(1), br * 0.02 - 0.1 * stalk - 0.06 * coil + 0.06 * digest * Math.max(0, Math.sin(t * 2.2)) - 0.18 * dead, churn(2));
  lob('gF', churn(3), -0.08 * engulf - 0.04 * stalk - 0.15 * dead, 0.22 * lunge + 0.14 * engulf + churn(4));
  lob('gB', churn(5), -0.12 * dead, -0.04 * coil + churn(6) + 0.05 * dead);
  for (const [s, k] of SIDES) {
    lob('gF' + s, k * (0.05 * stalk - 0.08 * engulf + 0.12 * dead) + churn(7 + k), -0.08 * dead, 0.1 * engulf + 0.05 * lunge);
    lob('gR' + s, k * (0.05 * stalk + 0.03 * digest * Math.sin(t * 1.6 + k) + 0.12 * dead) + churn(9 + k), -0.1 * dead, churn(10));
  }
  // ---- front legs
  for (const [s, k] of SIDES) {
    const reach = (-0.55 * haul * mv) - 0.25 * stalk - 1.1 * lunge + 0.2 * coil - 0.5 * engulf;
    P['arm' + s].rotation.set(reach + Math.sin(t * 1.1 + k) * 0.04, k * 0.12 * stalk, k * (0.12 + 0.2 * stalk + 0.3 * dead));
    P['fore' + s].rotation.set(-0.3 * mv * Math.max(0, haulD) + 0.5 * stalk + 0.35 * coil - 0.3 * lunge + 0.6 * dead, 0, 0);
    P['paw' + s].rotation.set(0.3 * mv * Math.max(0, -haulD) - 0.4 * stalk + 0.4 * lunge + Math.sin(t * 7 + k) * 0.05 * warn, 0, 0);
  }
  // ---- the head: slumped to one side, lolling; low and forward when it stalks; flung up when it gulps
  const loll = Math.sin(t * 0.6 + s9) * 0.12 * (1 - stalk) * (1 - dead);
  P.neck.rotation.set(0.25 + 0.3 * stalk - 0.5 * engulf + 0.2 * mv * haul + 0.4 * dead + coil * -0.2, d.tilt * 0.2 + loll * 0.5, d.tilt * (0.35 + 0.15 * dead) + loll);
  P.head.rotation.set(-0.1 * stalk + 0.1 * Math.sin(t * 2.1) * digest, Math.sin(t * 0.5 + s9) * 0.15 * (1 - stalk), d.tilt * 0.15);
  const jawOpen = 0.08 + 0.04 * br + 0.55 * lunge + 0.3 * warn * (0.6 + 0.4 * Math.sin(t * 8)) + 0.4 * engulf + (fs > 0.3 && fs < 0.95 ? 0.4 + Math.sin(t * 11) * 0.15 : 0) + 0.3 * dead;
  P.jaw.rotation.set(jawOpen, 0, 0);
  // ---- the flank paw: claws at the air, clenches, goes stiff and poised when it hunts
  const tw = Math.pow(Math.max(0, Math.sin(t * 1.7 + s9 * 2)), 12);
  P.sideArm.rotation.set(Math.sin(t * 0.9 + s9) * 0.35 * (1 - stalk) + tw * 0.5 + 0.6 * dead, Math.sin(t * 0.7) * 0.3 * (1 - stalk), Math.sin(t * 1.3 + s9) * 0.25 + 0.4 * lunge);
  P.sideFore.rotation.set(0.4 + Math.sin(t * 1.6 + s9) * 0.4 * (1 - stalk) - tw * 0.6 + 0.6 * dead, 0, Math.sin(t * 2.3) * 0.2);
  P.sidePaw.rotation.set(Math.sin(t * 3.1 + s9) * 0.35 + tw * 0.8 - 0.4 * stalk, Math.sin(t * 2.1) * 0.25, 0);
  // ---- the shoulder jaw: chews on nothing; gnashes when hungry or angry; gapes at the strike
  const gnash = Math.max(warn, stalk * 0.6, lunge, engulf);
  P.sjawLow.rotation.set(0, 0, -(WRONG_SIGN(K)) * (0.12 + Math.max(0, Math.sin(t * (1.4 + gnash * 9) + s9)) * (0.18 + gnash * 0.5) + lunge * 0.4 + dead * 0.3));
  // ---- the hind leg: dragged, flopping
  P.hip.rotation.set(0.3 + Math.sin(ph + 1) * 0.25 * mv + Math.sin(t * 0.8) * 0.05, 0, Math.sin(t * 1.1 + s9) * 0.12);
  P.hshin.rotation.set(-0.3 + Math.sin(ph + 2) * 0.2 * mv, 0, 0);
  P.hfoot.rotation.set(Math.sin(t * 2.6 + s9) * 0.25 * (1 - dead), 0, 0);
  // ---- heart and gut
  const beat = Math.pow(Math.max(0, Math.sin(t * (6.5 + warn * 4 + lunge * 6))), 6) * (1 - dead);
  P.heart.scale.setScalar(1 + beat * 0.22);
  P.gut.position.set(p0(P.gut).x + Math.sin(t * 0.8) * 0.02 * digest, p0(P.gut).y + Math.sin(t * 1.1) * 0.015, p0(P.gut).z + 0.05 * digest);
  // ---- drips: stretch, let go, grow back (each on its own clock)
  ['dripA', 'dripB', 'dripC'].forEach((n, i) => {
    const o = P[n]; if (!o) return;
    const cyc = ((t * (0.22 + i * 0.05) + i * 0.37 + d.seed) % 1);
    const len = dead ? 0.6 : 0.35 + cyc * cyc * 1.4;
    o.scale.set(1 - cyc * 0.35, len, 1 - cyc * 0.35);
    o.rotation.set(Math.sin(t * 2 + i) * 0.1, 0, Math.sin(t * 1.7 + i) * 0.1);
  });
  // ---- the meal inside: a bee, slowly turning, sinking, going to syrup
  preyPose(K, d);
  // ---- the jelly thins where it is stretched (fission strand) and dulls when it dies
  for (const m of films(K)) {
    const mat = m.material as THREE.MeshLambertMaterial;
    mat.opacity = 0.3 + 0.05 * Math.sin(t * 0.9 + s9) * (1 - dead) + 0.12 * dead - 0.1 * sep;
  }
  if (d.flinch > 0) { co.position.x += Math.sin(t * 70) * 0.03 * d.flinch; if (!ud.hitK) { ud.hitK = 1; kick(K, [(Math.random() - 0.5) * 2, 0.6, -0.8], 0.8); } } else ud.hitK = 0;
}
// which way the shoulder jaw's hinge opens (it can be on either side)
function WRONG_SIGN(K: KitRig): number { const v = K.kit.entry.variant; return Math.sign(WRONG[v].jaw[0]) || 1; }

function preyPose(K: KitRig, d: GummyDrive) {
  const m = K.kit.m;
  if (d.prey <= 0 || d.prey >= 1) { if (m.bee) (m.bee as KitRig).root.visible = false; return; }
  let bee = m.bee as KitRig | undefined;
  if (!bee) {
    bee = m.bee = buildBee(d.preyV | 0);
    bee.root.scale.setScalar(0.5);
    K.parts.gut.add(bee.root);
  }
  bee.root.visible = true;
  const p = d.prey;
  // drawn in through the front (engulf), then sinking into the stomach and turning over
  const inT = Math.min(1, p / 0.08);
  bee.root.position.set(Math.sin(d.t * 0.4) * 0.03, -0.3 - p * 0.05, 0.35 * (1 - inT) - 0.02);
  bee.root.rotation.set(0.4 * p + Math.sin(d.t * 0.5) * 0.2, 1.2 + p * 2.5, Math.sin(d.t * 0.3) * 0.3 + p * 1.2);
  bee.root.scale.setScalar(0.5 * (1 - p * 0.35));
  kitSync(bee);
  poseBee(bee, { t: d.t, dt: d.dt, fly: 1, panic: inT < 1 ? 1 : 0, bonk: 0, bonkSide: 1, dead: Math.min(1, p * 2) * 0.3, seed: 0.2, flinch: 0, speed: 0, still: Math.min(1, p * 4) });
  bee.kit.F.fx.value.w = Math.min(0.95, Math.max(0, (p - 0.25) / 0.75));
  bee.kit.F.tint.value.set(1, 0.55, 0.35, Math.min(0.8, p));
}

// ------------------------------------------------------------------ in-game animation
function animateGummy(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); filmPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>, seed = hashId(c.id, 7);
  // size: grows back after a split (smoothed so the split itself reads as a wet snap, not a pop)
  const sz = sm(ud, 'sz', n.sz ?? 1, ud.sz === undefined ? 100 : 3, dt);
  rig.root.scale.setScalar(sz);
  // the body's own acceleration in its local frame (lobes lag behind it)
  const vx = ud.px === undefined ? 0 : (c.x - ud.px) / Math.max(1e-3, dt), vz = ud.pz === undefined ? 0 : (c.z - ud.pz) / Math.max(1e-3, dt);
  ud.px = c.x; ud.pz = c.z;
  const fwd = vx * Math.cos(c.facing) + vz * Math.sin(c.facing), lat = vx * Math.sin(c.facing) - vz * Math.cos(c.facing);
  const ax = Math.max(-25, Math.min(25, (lat - (ud.vl ?? lat)) / Math.max(1e-3, dt))), az = Math.max(-25, Math.min(25, (fwd - (ud.vf ?? fwd)) / Math.max(1e-3, dt)));
  ud.vl = lat; ud.vf = fwd;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'pop') kick(K, [0, 1.6, -1.2], 1);
    else if (f.key === 'gulp') kick(K, [0, -0.8, 1.4], 0.6);
    else if (f.key === 'lunge') kick(K, [0, 0.4, -2.2], 0.5);
    else if (f.key === 'land') kick(K, [0, -1.2, 0.6], 0.8);
  }
  if (n.pop && !ud.popped) { ud.popped = 1; kick(K, [0, 2, 1.4], 1); }
  const ac = attackCurve(rig, c, t);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 1.2) : 0;
  const W = WRONG[v];
  poseGummy(K, {
    t, dt, speed: c.speed / Math.max(0.5, sz), phase: c.phase, md: c.dead ? '' : (n.md ?? ''), fs: n.fs ?? 0, prey: n.prey ?? 0, preyV: n.pv ?? 0,
    atk: Math.max(ac.wind, ac.strike), dead: ud.dk * ud.dk * (3 - 2 * ud.dk), flinch: flinchOf(c), seed, tilt: W.tilt, ax, az,
  });
  uprightDead(K, c);
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  // wet steps
  if (ud.step) { ud.step = 0; if (c.visibleToLocal && (ud.sndT ?? 0) < t) { ud.sndT = t + 0.35; playAt('bh_squelch', c, 0.35, 9, 0.55 + Math.random() * 0.15); } }
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal) {
    const dd = dist(p, c);
    if (n.md === 'split' && dd < 14) thinkOnce(p, 'gummy_split', 'It is pinching itself in two. Both halves are moving.', 60);
    else if ((n.prey ?? 0) > 0 && dd < 10) thinkOnce(p, 'gummy_meal', 'I can see the bee inside it. It is still moving. Then it is not.', 80);
    else if (n.md === 'stalk' && dd < 12) thinkOnce(p, 'gummy_stalk', 'It has gone flat and quiet. It is creeping up on something.', 50);
    else if (dd < 7) thinkOnce(p, 'gummy', ['A bear. No. A bear made of red jelly, with the fur floating on it.', 'There is a paw coming out of its side. And that is a jaw. On its shoulder.', 'I can see its spine through it. Its heart. It is beating.'][Math.floor(t * 0.13) % 3], 90);
  }
}

// ------------------------------------------------------------------ host brain
const SPLIT_T = 8, LUNGE_T = 0.42, COIL_T = 0.6, ENGULF_T = 1.1, DIGEST_T = 16;
interface Prey { c?: Creature; p?: Player; x: number; z: number; d: number; dead?: boolean }
function bees(c: Creature, r: number): Prey | null {
  let best: Prey | null = null;
  const skip = (c.mem.skip ?? {}) as Record<string, number>;
  for (const o of CS().creatures.values()) {
    if (o.zoneKey !== c.zoneKey || o.sp.key !== 'bumble_bee' || (o.dead && o.butchered) || (skip[o.id] ?? 0) > G.time) continue;
    const d = dist(o, c);
    if (d < r && (!best || d < best.d)) best = { c: o, x: o.x, z: o.z, d, dead: o.dead };
  }
  return best;
}
function bearsIn(zk: string) { let n = 0; for (const o of CS().creatures.values()) if (o.zoneKey === zk && !o.dead && o.sp.key === 'gummy_bear') n++; return n; }
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }

function thinkGummy(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  if (!m.init) { m.init = 1; m.hunger = m.hunger ?? rng.float(0.3, 0.75); m.fed = m.fed ?? 0; }
  if (n.sz === undefined) n.sz = 1;
  if (n.pop && G.time - (m.born ?? 0) > 2) n.pop = 0;
  const sz: number = n.sz;
  c.radius = c.sp.radius * sz; c.height = c.sp.height * sz;
  m.mdT = (m.mdT ?? 0) + dt;
  m.hunger = Math.min(1, (m.hunger ?? 0.5) + dt / 140);
  if (sz < 1) n.sz = Math.min(1, +(sz + (dt / 240) * (1 + (m.fed ?? 0) * 0.8)).toFixed(4));
  // provoked: whoever hurt it, for a while
  if (ev.hurt > 0) {
    const pid = c.targetId && G.players.has(c.targetId) ? c.targetId : null;
    if (pid) m.anger = { pid, until: G.time + 22 };
    fx(c, 'land');
    if ((n.md === 'digest' || n.md === 'split') && rng.chance(0.5)) { setMd(c, ''); n.fs = 0; }
  }
  if (m.anger && G.time > m.anger.until) m.anger = null;
  const md: string = n.md ?? '';
  // ---- digesting: it sits, churning; the meal fades
  if ((n.prey ?? 0) > 0) {
    n.prey = Math.min(1, +(n.prey + dt / DIGEST_T).toFixed(3));
    if (n.prey >= 1) {
      n.prey = 0; m.hunger = Math.max(0, m.hunger - 0.55); m.fed = (m.fed ?? 0) + 1;
      playAt('bh_gurgle', c, 0.7, 12, 0.6);
      if (md === 'digest') setMd(c, '');
    }
  }
  // ---- fission: two meals in, full grown, room for another: it pinches in two
  if (md === 'split') {
    stop(c); c.setState('nest');
    n.fs = Math.min(1, +((n.fs ?? 0) + dt / SPLIT_T).toFixed(3));
    if (m.mdT > 1 && (m.splitSnd ?? 0) < G.time) { m.splitSnd = G.time + rng.float(1.2, 2.2); playAt(n.fs < 0.6 ? 'gore_squelch' : 'gore_tear', c, 0.7, 14, 0.6 + n.fs * 0.3); }
    if (n.fs >= 1) split(c);
    return true;
  }
  if (!m.anger && (m.fed ?? 0) >= 2 && sz >= 0.92 && !(n.prey > 0) && md !== 'digest' && bearsIn(c.zoneKey) < 6) {
    setMd(c, 'split'); n.fs = 0; playAt('bh_gurgle', c, 0.8, 14, 0.5);
    for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 12) { ruleShown(c); break; }
    return true;
  }
  // ---- in the middle of a strike
  if (md === 'coil') {
    stop(c);
    const tg = m.tg as Prey | undefined;
    if (tg) faceTo(c, tg.c?.x ?? tg.p?.x ?? tg.x, tg.c?.z ?? tg.p?.z ?? tg.z);
    if (m.mdT > COIL_T) { setMd(c, 'lunge'); fx(c, 'lunge'); playAt('hound_snarl', c, 0.9, 16, 0.55); m.lx = tg?.c?.x ?? tg?.p?.x ?? c.x; m.lz = tg?.c?.z ?? tg?.p?.z ?? c.z; }
    return true;
  }
  if (md === 'lunge') {
    c.setState('attack');
    const tg = m.tg as Prey | undefined;
    const tx = m.lx ?? c.x, tz = m.lz ?? c.z, dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz) || 1;
    c.targetFacing = Math.atan2(dz, dx);
    const sp = d > 0.4 * sz ? 5.2 * Math.min(1, sz + 0.2) : 0;
    c.vx = (dx / d) * sp; c.vz = (dz / d) * sp; c.speed = sp;
    if (m.mdT > LUNGE_T) {
      stop(c);
      if (tg?.c && cs.creatures.has(tg.c.id) && dist(tg.c, c) < 1.15 * sz + tg.c.radius) engulfBee(c, tg.c);
      else if (tg?.p && !tg.p.body.dead && dist(tg.p, c) < c.sp.attack!.range * sz + tg.p.radius + 0.3) { attack(c, tg.p); setMd(c, 'engulf'); m.engP = 1; }
      else { setMd(c, 'miss'); playAt('bh_plop', c, 0.6, 10, 0.5); }
    }
    return true;
  }
  if (md === 'engulf') {
    stop(c); c.setState('eat');
    if (m.mdT > ENGULF_T) { const wasP = m.engP; m.engP = 0; setMd(c, wasP ? '' : 'digest'); }
    return true;
  }
  if (md === 'miss') { stop(c); if (m.mdT > 1.3) setMd(c, ''); return true; }
  if (md === 'digest' && !m.anger) {
    stop(c); c.setState('eat');
    // a survivor right on top of it gets a warning gape, nothing more
    return true;
  }
  // ---- choose what to go for
  let tg: Prey | null = null;
  const angerP = m.anger ? (G.players.get(m.anger.pid) as Player | undefined) : undefined;
  if (angerP && !angerP.body.dead && angerP.zoneKey === c.zoneKey && dist(angerP, c) < 22) tg = { p: angerP, x: angerP.x, z: angerP.z, d: dist(angerP, c) };
  if (!tg && m.hunger > 0.15 && !(n.prey > 0)) { const b = bees(c, m.hunger > 0.3 ? 15 : 6); if (b) tg = b; }
  let near: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (!near || d < near.d) near = { p, d }; }
  if (!tg && near && m.hunger > 0.8 && near.d < 10 && !(n.prey > 0) && ((m.skip ?? {})[near.p.id] ?? 0) < G.time) tg = { p: near.p, x: near.p.x, z: near.p.z, d: near.d };
  // ---- a survivor too close to a fed bear: it warns (gapes, gnashes, wobbles); stay and it strikes
  if (!tg && near && near.d < 1.9 * sz + 0.4) {
    setMd(c, 'warn'); stop(c); faceTo(c, near.p.x, near.p.z); c.setState('warn');
    m.warnT = (m.warnT ?? 0) + dt;
    if (c.noiseCooldown <= 0) { playAt('dog_growl', c, 0.8, 14, 0.5); c.noiseCooldown = 2.5; }
    if (m.warnT > 2.6) { m.tg = { p: near.p, x: near.p.x, z: near.p.z, d: near.d }; setMd(c, 'coil'); m.warnT = 0; }
    return true;
  }
  m.warnT = Math.max(0, (m.warnT ?? 0) - dt);
  if (tg) {
    m.tg = tg;
    const tx = tg.c?.x ?? tg.p!.x, tz = tg.c?.z ?? tg.p!.z, d = Math.hypot(tx - c.x, tz - c.z);
    // no headway (walls, a bee up where it cannot reach): give that one up for a while
    const tid = tg.c?.id ?? tg.p!.id;
    if (m.chaseId !== tid) { m.chaseId = tid; m.chaseBest = d; m.chaseT = 0; }
    m.chaseT += dt;
    if (d < m.chaseBest - 0.5) { m.chaseBest = d; m.chaseT = 0; }
    if (m.chaseT > 14 && !m.anger) { (m.skip ??= {})[tid] = G.time + 40; m.chaseId = null; setMd(c, ''); return true; }
    // a dead bee is just picked up
    if (tg.dead && tg.c) {
      setMd(c, ''); c.setState('travel');
      if (cs.moveTo(c, z, tx, tz, c.sp.walk, dt, 0.7 * sz)) engulfBee(c, tg.c);
      return true;
    }
    const angry = !!tg.p && !!m.anger;
    if (d < 2.5 * sz + (tg.c ? 0.2 : 0.6)) { setMd(c, 'coil'); stop(c); playAt('dog_growl', c, 0.6, 12, 0.45); return true; }
    // stalk: low, flat, slow; angry, it just comes (surging, faster than it looks)
    // a bee that has noticed and is wheezing away gets run down (it is not fast); otherwise it creeps
    const bolting = !!tg.c && (netOf(tg.c).md === 'panic' || netOf(tg.c).md === 'up') && d < 9;
    setMd(c, angry ? 'warn' : bolting ? 'chase' : 'stalk'); c.setState(angry || bolting ? 'chase' : 'stalk');
    cs.moveTo(c, z, tx, tz, angry ? c.sp.run : bolting ? c.sp.run * 0.75 : c.sp.walk * 0.6, dt, 0.5);
    return true;
  }
  // ---- nothing to do: a slow galumph about the place, long sits, the odd gurgle
  if (md === 'stalk' || md === 'warn' || md === 'chase') setMd(c, '');
  if (md === 'sit') { stop(c); c.setState('idle'); if (m.mdT > (m.sitT ?? 6)) setMd(c, ''); return true; }
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 20) {
    if (c.goal && rng.chance(0.45)) { setMd(c, 'sit'); m.sitT = rng.float(4, 10); c.goal = null; return true; }
    c.goal = findSpot(c, { rMin: 3, rMax: 10 }) ?? cs.wanderSpot(c, z, 10);
    c.stateT = 0;
  }
  if (c.noiseCooldown <= 0 && rng.chance(dt * 0.06)) { playAt('bh_gurgle', c, 0.5, 10, 0.5 + rng.float(0, 0.2)); c.noiseCooldown = 8; }
  return true;
}

function engulfBee(c: Creature, bee: Creature) {
  const cs = CS(), n = net(c);
  n.pv = Math.floor(hashId(bee.id) * 3);
  n.prey = 0.001;
  cs.remove(bee);
  setMd(c, 'engulf');
  fx(c, 'gulp');
  playAt('bh_gulp', c, 1, 14, 0.55); playAt('gore_squelch', c, 0.8, 12, 0.6);
  for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 10) { ruleShown(c); break; }
}

function split(c: Creature) {
  const cs = CS(), z = zoneOf(c), n = net(c), m = c.mem;
  const sz: number = n.sz ?? 1, half = Math.max(0.55, sz * 0.62);
  const fx0 = Math.cos(c.facing), fz0 = Math.sin(c.facing), back = 0.75 * sz;
  let dx = c.x - fx0 * back, dz = c.z - fz0 * back;
  if (!walkable(z, Math.floor(dx), Math.floor(dz))) { dx = c.x; dz = c.z; }
  const d = cs.spawn('gummy_bear', c.zoneKey, dx, dz);
  if (d) {
    d.facing = d.targetFacing = c.facing + Math.PI + rng.float(-0.5, 0.5);
    const dn = net(d); dn.sz = half; dn.md = ''; dn.pop = 1;
    d.mem.init = 1; d.mem.hunger = 0.5; d.mem.fed = 0; d.mem.born = G.time; d.mem.persistent = !!m.persistent;
    d.radius = d.sp.radius * half; d.height = d.sp.height * half;
  }
  c.x += fx0 * 0.15 * sz; c.z += fz0 * 0.15 * sz;
  n.sz = half; n.fs = 0; setMd(c, ''); m.fed = 0; m.hunger = 0.45;
  fx(c, 'pop');
  playAt('gore_burst', c, 1, 16, 0.7); playAt('bh_squelch', c, 0.9, 12, 0.5);
}

const GUMMY = def({
  key: 'gummy_bear', name: 'Gummy Bear', code: 'LG-01 // FAUNA, URSID (LEDGE-EXPOSED)', temperament: 'neutral', threat: 3,
  rule: { name: 'FED, IT DIVIDES', text: 'It hunts the giant bees: stalks flat and slow, coils, lunges and swallows them whole, then sits to digest. After two meals it pinches itself in two. Fed, it leaves you alone unless you stand on top of it. Hungry, with no bees about, it will try to swallow you. Hurt it and it comes for you.', tell: 'A bear. A bear-shaped thing made of red jelly, with fur floating on it. I can see its bones.' },
  hp: 95, walk: 0.7, run: 2.4, turn: 2.6, radius: 0.55, height: 0.95, sight: 13, fov: 1.6, hearing: 1, smell: true,
  attack: { dmg: [9, 17], range: 1.2, cooldown: 2.4, kinds: ['burn', 'bite', 'bruise'], corrupt: 0.03, knock: 0.25, grab: true },
  zones: ['ledge', 'fields', 'corrupt'], weight: 1, group: [1, 1], maxPerZone: 4, diet: 'meat',
  meat: [['meat_raw', 2]],
  sounds: { idle: 'bh_gurgle', alert: 'dog_growl', attack: 'hound_snarl', hurt: 'gore_squelch', death: 'underlay_die', step: 'bh_squelch' },
  scan: {
    cls: 'Fauna / ursid, Ledge-exposed, fissile',
    notes: [
      'A brown bear gone to translucent red jelly. Its skeleton, heart and stomach are visible inside.',
      'Patches of real fur float on the surface. The limbs are a bear\'s, in the wrong places: a paw from its flank, a jaw on its shoulder.',
      'It stalks the giant bees, lunges and swallows them whole. You can watch them dissolve.',
      'After two meals it splits in two. Hungry, or hurt, it goes for people.',
    ],
  },
  gore: { blood: 'pale', tint: 0xff6a3a, flesh: 0xd8562a, sever: ['sideArm', 'sjawLow', 'armL', 'armR', 'hip', 'ear', 'jaw'], head: 'head' },
  build: () => buildGummyBear(0), animate: animateGummy, think: thinkGummy,
});
(GUMMY as any).handlesSevered = true;
onPlayerHit('gummy_bear', (p) => {
  bus.emit('think', p, ['It is all over me. It is warm and it BURNS.', 'It tried to swallow me. I can still feel it on my skin.', 'Sweet. It smells sweet. It stings like acid.'][Math.floor(Math.random() * 3)]);
});

// ------------------------------------------------------------------ stand-alone posing (gallery, the poster banner, the lab)
export type GummyPose = 'walk' | 'idle' | 'stalk' | 'coil' | 'lunge' | 'engulf' | 'digest' | 'split' | 'warn' | 'dead';
/**
 * Animate a gummy bear rig with no game running: call every frame with a
 * running clock. `fs` overrides the fission progress for 'split' (default:
 * loops over 9 s); `prey` the digestion for 'digest' (default: loops).
 */
export function poseGummyBear(rig: KitRig, t: number, dt: number, pose: GummyPose = 'idle', o: { fs?: number; prey?: number; speed?: number; variant?: number } = {}) {
  const ud = rig.kit.m as Record<string, number>;
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant) { kitPersonalize(rig, o.variant); filmPersonalize(rig, o.variant); }
  kitSync(rig);
  const W = WRONG[rig.kit.entry.variant];
  // a fake run-up for the lunge so the springs feel it
  const lungeA = pose === 'lunge' ? (Math.floor(t / 1.6) !== ud.gl ? (ud.gl = Math.floor(t / 1.6), 1) : 0) : 0;
  if (lungeA) kick(rig, [0, 0.4, -2.2], 0.5);
  if (pose === 'split' && (o.fs ?? (t % 9) / 8) < (ud.lastFs ?? 0)) kick(rig, [0, 1.6, -1.2], 1);
  const fs = pose === 'split' ? (o.fs ?? Math.min(1, (t % 9) / 8)) : 0;
  ud.lastFs = fs;
  const prey = pose === 'digest' || pose === 'engulf' ? (o.prey ?? (pose === 'engulf' ? 0.02 : ((t % 12) / 12) * 0.95 + 0.01)) : 0;
  const speed = o.speed ?? (pose === 'walk' ? 0.7 : pose === 'stalk' ? 0.4 : 0);
  poseGummy(rig, {
    t, dt, speed, phase: 0, md: pose === 'walk' || pose === 'idle' || pose === 'dead' ? '' : pose, fs, prey, preyV: 1,
    atk: 0, dead: pose === 'dead' ? 1 : 0, flinch: 0, seed: 0.31, tilt: W.tilt, ax: 0, az: lungeA ? 0 : 0,
  });
  rig.kit.F.fx.value.y += dt;
}
GUMMY.animateGallery = (rig: Rig, t: number) => {
  const q = (new URLSearchParams(location.search).get('pose') || ['walk', 'stalk', 'lunge', 'digest', 'split'][Math.floor(t / 5) % 5]) as GummyPose;
  const u = new URLSearchParams(location.search);
  const num = (k: string) => (u.get(k) !== null ? Number(u.get(k)) : undefined);
  poseGummyBear(rig as KitRig, t, 1 / 60, q, { variant: num('v') ?? 0, fs: num('fs'), prey: num('prey') });
};
horrify(GUMMY, { twitch: 0.35, snap: 0.12, breathe: 0.004, lunge: 0.06, parts: /neck|head|jaw|sideArm|sideFore|sidePaw|hfoot|ear/, keepMaterials: false });
