import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { worldMaterial } from '../../gfx/materials';
import { itemGeometry } from '../../items/itemMeshes';
import { HumanRig, Pose as HPose } from '../../entities/humanRig';
import { BONES, BONE_PARENT, REG, type Dims } from '../../entities/humanModel';
import type { AnimInput } from '../../entities/humanAnim';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { species as getSpecies } from '../registry';
import { CS, zoneOf, pulse, attack, stop, faceTo, findSpot, floorItemsAround, takeFloorItem, dropStored, restoreStore, galleryPose } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, walkable, fakeCreature, lineOfSightB } from '../behaviors_b';
import { KitDef, SkinB, BuildCtx, Page, V3, Wt, BoneSpec, kitEntry, kitMaterial, kitFx, type KitFx, hash, flinchOf, cutState, cutSync, type CutState } from '../kit/humanoids';
import { chain, sac, blade, plate, paintCap } from '../kit/organic';
import { filmKitMaterial } from '../kit/gel';
import { MEMORIES, ADULT_MEMORIES, waxify, pageData, pageTexture as replicaTex, replicaPose } from '../kit/replica';
import './still_life';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE BEE KEEPER — a Still Life (still_life.ts: the place's wax copies of
// people) that the Giant Bumble Bees fed on for so long that they grew into
// it. They ate the wax off it, and what they left in it, eggs, fuzz, honey,
// took root. Now it is a person and a bee at once: a human body with fuzz
// growing through the skin and the clothes, clusters of glossy compound eyes
// where the eyes were and on the brow and the cheek, antennae out of the
// forehead, mandibles splitting the jaw, a pair of thin jointed bee legs out
// of the ribs that never stop moving, a banded abdomen sagging out of the
// small of its back, four wings on the shoulder blades far too small to lift
// it, and honey wax seeping out of it everywhere, from the eyes, the mouth,
// the wrists. It is curious. It follows you round at a polite distance,
// watches you, copies how you stand and move, and picks up whatever you put
// down to turn it over and over in its hands. Corner it and it stings.
// A Still Life the bees keep feeding on turns into one, slowly, visibly: the
// growths come through it a little more at each visit (waxFeed / the Still
// Life overlay below).
//   bee_keeper   the survivors' HumanRig dressed as the Still Life it was (waxed page,
//                plus fuzz and honey painted through it), with a skinned kit overlay bound
//                to the same skeleton (growths, eyes, antennae, mandibles, rib legs, gaster)
//                and a translucent film (wings).
// POSTER / VIDEO API (stand-alone):
//   buildBeeKeeper(memory?)                       -> Rig (rig.root into any scene)
//   poseBeeKeeper(rig, t, dt, pose, { growth? })  pose: 'idle' | 'walk' | 'watch' | 'mimic' |
//                                                 'inspect' | 'buzz' | 'sting' | 'wake' | 'dead'
//   growth (0..1) shows a Still Life part-way through turning.
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// ------------------------------------------------------------------ skeleton: the human bones plus the bee's
/** every distinct body shape gets its own slot (the overlay is built on that body's bind pose) */
const SLOTS: Dims[] = [];
const MAX_SLOTS = 40;
function slotOf(d: Dims): number {
  const same = (a: Dims) => a.s === d.s && a.bw === d.bw && a.fem === d.fem && a.headS === d.headS && a.mass === d.mass;
  let i = SLOTS.findIndex(same);
  if (i < 0) { if (SLOTS.length >= MAX_SLOTS) return 0; SLOTS.push(d); i = SLOTS.length - 1; }
  return i;
}
const EXTRA: [string, string, (r: (b: string) => V3, s: number) => V3][] = [
  ['antL1', 'head', (r, s) => add3(r('head'), [0.024 * s, 0.155 * s, 0.075 * s])], ['antL2', 'antL1', (r, s) => add3(r('head'), [0.06 * s, 0.25 * s, 0.13 * s])],
  ['antR1', 'head', (r, s) => add3(r('head'), [-0.024 * s, 0.155 * s, 0.075 * s])], ['antR2', 'antR1', (r, s) => add3(r('head'), [-0.06 * s, 0.25 * s, 0.13 * s])],
  ['mandL', 'head', (r, s) => add3(r('head'), [0.042 * s, 0.025 * s, 0.07 * s])], ['mandR', 'head', (r, s) => add3(r('head'), [-0.042 * s, 0.025 * s, 0.07 * s])],
  ['wFL', 'chest', (r, s) => add3(r('chest'), [0.06 * s, 0.19 * s, -0.11 * s])], ['wHL', 'chest', (r, s) => add3(r('chest'), [0.055 * s, 0.13 * s, -0.115 * s])],
  ['wFR', 'chest', (r, s) => add3(r('chest'), [-0.06 * s, 0.19 * s, -0.11 * s])], ['wHR', 'chest', (r, s) => add3(r('chest'), [-0.055 * s, 0.13 * s, -0.115 * s])],
  ['xl1L', 'chest', (r, s) => add3(r('chest'), [0.13 * s, 0.03 * s, 0.03 * s])], ['xl2L', 'xl1L', (r, s) => add3(r('chest'), [0.25 * s, 0.01 * s, 0.1 * s])], ['xl3L', 'xl2L', (r, s) => add3(r('chest'), [0.27 * s, -0.16 * s, 0.15 * s])],
  ['xl1R', 'chest', (r, s) => add3(r('chest'), [-0.13 * s, 0.03 * s, 0.03 * s])], ['xl2R', 'xl1R', (r, s) => add3(r('chest'), [-0.25 * s, 0.01 * s, 0.1 * s])], ['xl3R', 'xl2R', (r, s) => add3(r('chest'), [-0.27 * s, -0.16 * s, 0.15 * s])],
  ['g1', 'spine', (r, s) => add3(r('spine'), [0, -0.03 * s, -0.12 * s])], ['g2', 'g1', (r, s) => add3(r('spine'), [0, -0.24 * s, -0.27 * s])],
];
const XNAMES = EXTRA.map((e) => e[0]);
function bonesK(v: number): BoneSpec[] {
  const d = SLOTS[v] ?? SLOTS[0];
  const out: BoneSpec[] = BONES.map((b) => ({ name: b, parent: BONE_PARENT[b], at: d.off[b].slice() as V3, cap: b === 'head' }));
  const abs = new Map<string, V3>(BONES.map((b) => [b, d.rest[b].slice() as V3]));
  const r = (b: string) => abs.get(b)!;
  for (const [name, parent, f] of EXTRA) {
    const p = f(r, d.s);
    abs.set(name, p);
    const q = r(parent);
    out.push({ name, parent, at: [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cap: name === 'g1' });
  }
  return out;
}
function layoutK(p: Page) { p.reg('FUZZ', 32, 32); p.reg('EYE', 16, 16); p.reg('LEG', 16, 48); p.reg('GASTER', 48, 32); p.reg('COMB', 24, 24); p.reg('HONEY', 16, 16); p.reg('MAND', 16, 16); p.reg('CAP', 8, 8); }

const fz = (amp: number, seed: number) => (a: number, t: number) => (hash(Math.round(a * 4) + 31, Math.round(t * 9) + seed) - 0.5) * amp;
function buildK(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, r = (b: string) => x.rest(b), d = SLOTS[x.variant] ?? SLOTS[0], s = d.s, bw = d.bw;
  const W1 = (b: string): Wt => [bi(b), 1];
  // ---- fuzz tufts through the skin and the clothes: shoulders, back, chest, neck, scalp, upper arms, thighs
  const tuft = (bone: string, at: V3, n: V3, len: number, rad: number, seed: number) => {
    const l = Math.hypot(n[0], n[1], n[2]) || 1, nn: V3 = [n[0] / l, n[1] / l, n[2] / l];
    const bend: V3 = [(hash(seed, 1) - 0.5) * 0.4, -0.25, (hash(seed, 2) - 0.5) * 0.4];
    const pts: V3[] = [add3(at, [-nn[0] * 0.01, -nn[1] * 0.01, -nn[2] * 0.01]), add3(at, [nn[0] * len * 0.45, nn[1] * len * 0.45, nn[2] * len * 0.45]), add3(at, [(nn[0] + bend[0] * 0.6) * len, (nn[1] + bend[1] * 0.6) * len, (nn[2] + bend[2] * 0.6) * len])];
    sac(B, R('FUZZ'), 1 + (seed % 7), pts, [[rad, rad], [rad * 0.8, rad * 0.75], [rad * 0.12, rad * 0.12]], [W1(bone), W1(bone), W1(bone)], { n: 6, bump: fz(0.6, seed) });
  };
  const yS = r('spine')[1], yN = r('neck')[1];
  for (let k = 0; k < 34; k++) {
    const th = (hash(k, 3) - 0.5) * Math.PI * 2, y = yS + 0.04 + hash(k, 4) * (yN - yS - 0.02);
    const rx = 0.14 * bw * s * (y > yN - 0.12 ? 1.15 : 1), rz = 0.1 * s;
    const p: V3 = [Math.sin(th) * rx, y, Math.cos(th) * rz - 0.005];
    // thickest across the back and shoulders
    if (Math.cos(th) > 0.3 && hash(k, 5) < 0.55) continue;
    tuft(y < r('chest')[1] ? 'spine' : 'chest', p, [Math.sin(th), 0.25, Math.cos(th)], (0.035 + hash(k, 6) * 0.04) * s, (0.022 + hash(k, 7) * 0.016) * s, k);
  }
  for (let k = 0; k < 6; k++) { const th = hash(k, 8) * Math.PI * 2; const nk = r('neck'); tuft('neck', [nk[0] + Math.sin(th) * 0.05 * s, nk[1] + 0.03 * s + hash(k, 9) * 0.05 * s, nk[2] + Math.cos(th) * 0.045 * s], [Math.sin(th), 0.1, Math.cos(th)], 0.03 * s, 0.018 * s, 40 + k); }
  for (let k = 0; k < 12; k++) {
    const th = (hash(k, 10) - 0.5) * 2.6 + Math.PI, ph = hash(k, 11) * 1.1;
    const hc = add3(r('head'), [0, 0.11 * s, -0.01 * s]);
    tuft('head', [hc[0] + Math.sin(th) * Math.cos(ph) * 0.095 * s, hc[1] + Math.sin(ph) * 0.09 * s, hc[2] + Math.cos(th) * Math.cos(ph) * 0.1 * s], [Math.sin(th) * Math.cos(ph), Math.sin(ph) + 0.2, Math.cos(th) * Math.cos(ph)], 0.04 * s, 0.02 * s, 60 + k);
  }
  for (const [sd, k] of SIDES) {
    const a = r('uarm' + sd), b = r('farm' + sd);
    for (let i = 0; i < 7; i++) { const t = 0.1 + hash(i, 12 + k) * 0.8, th = hash(i, 14 + k) * Math.PI * 2; const p: V3 = [a[0] + (b[0] - a[0]) * t + Math.sin(th) * 0.045 * s, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + Math.cos(th) * 0.045 * s]; tuft('uarm' + sd, p, [Math.sin(th), 0.15, Math.cos(th)], 0.03 * s, 0.017 * s, 80 + i + (k > 0 ? 0 : 20)); }
    const fa = r('farm' + sd), ha = r('hand' + sd);
    for (let i = 0; i < 3; i++) { const t = 0.2 + i * 0.25, th = hash(i, 16 + k) * Math.PI * 2; tuft('farm' + sd, [fa[0] + (ha[0] - fa[0]) * t + Math.sin(th) * 0.035 * s, fa[1] + (ha[1] - fa[1]) * t, fa[2] + Math.cos(th) * 0.035 * s], [Math.sin(th), 0, Math.cos(th)], 0.025 * s, 0.014 * s, 120 + i + (k > 0 ? 0 : 10)); }
    const ta = r('thigh' + sd), sa = r('shin' + sd);
    for (let i = 0; i < 4; i++) { const t = 0.1 + i * 0.2, th = hash(i, 18 + k) * Math.PI * 2; tuft('thigh' + sd, [ta[0] + (sa[0] - ta[0]) * t + Math.sin(th) * 0.065 * s, ta[1] + (sa[1] - ta[1]) * t, ta[2] + Math.cos(th) * 0.065 * s], [Math.sin(th), 0.1, Math.cos(th)], 0.03 * s, 0.02 * s, 140 + i + (k > 0 ? 0 : 10)); }
  }
  // ---- compound eyes: a cluster where the left eye was, one on the brow, one on the right cheek, a few on the shoulder
  const H = r('head');
  const eyes = (bone: string, c: V3, out: V3, n: number, size: number, seed: number) => {
    const l = Math.hypot(out[0], out[1], out[2]) || 1, o: V3 = [out[0] / l, out[1] / l, out[2] / l];
    const u: V3 = Math.abs(o[1]) > 0.9 ? [1, 0, 0] : [o[2], 0, -o[0]];
    const ul = Math.hypot(u[0], u[1], u[2]) || 1; u[0] /= ul; u[2] /= ul;
    const w: V3 = [o[1] * u[2] - o[2] * u[1], o[2] * u[0] - o[0] * u[2], o[0] * u[1] - o[1] * u[0]];
    for (let i = 0; i < n; i++) {
      const a = i === 0 ? 0 : (i / (n - 1)) * Math.PI * 2 + seed, rr = i === 0 ? 0 : size * 1.25;
      const rad = size * (i === 0 ? 1.15 : 0.75 + hash(i, seed) * 0.35);
      const cc: V3 = [c[0] + (u[0] * Math.cos(a) + w[0] * Math.sin(a)) * rr, c[1] + (u[1] * Math.cos(a) + w[1] * Math.sin(a)) * rr, c[2] + (u[2] * Math.cos(a) + w[2] * Math.sin(a)) * rr];
      sac(B, R('EYE'), 20 + i + seed, [add3(cc, [-o[0] * rad * 0.6, -o[1] * rad * 0.6, -o[2] * rad * 0.6]), add3(cc, [o[0] * rad * 0.15, o[1] * rad * 0.15, o[2] * rad * 0.15]), add3(cc, [o[0] * rad * 0.75, o[1] * rad * 0.75, o[2] * rad * 0.75])],
        [[rad * 0.7, rad * 0.7], [rad, rad], [rad * 0.45, rad * 0.45]], [W1(bone), W1(bone), W1(bone)], { n: 8, emis: 0 });
    }
  };
  eyes('head', add3(H, [0.034 * s, 0.098 * s, 0.083 * s]), [0.35, 0.1, 1], 7, 0.016 * s, 1);
  eyes('head', add3(H, [-0.012 * s, 0.155 * s, 0.07 * s]), [-0.1, 0.6, 1], 5, 0.012 * s, 3);
  eyes('head', add3(H, [-0.052 * s, 0.05 * s, 0.07 * s]), [-0.7, -0.1, 0.8], 4, 0.011 * s, 5);
  eyes('chest', add3(r('uarmL'), [-0.01 * s, 0.035 * s, 0.05 * s]), [0.3, 0.6, 0.7], 4, 0.013 * s, 7);
  // ---- antennae out of the forehead, mandibles splitting out of the jaw
  for (const [sd, k] of SIDES) {
    chain(B, x, R('LEG'), 30, { bones: ['ant' + sd + '1', 'ant' + sd + '2'], tip: add3(H, [k * 0.12 * s, 0.3 * s, 0.24 * s]), r: [0.007 * s, 0.003 * s], n: 5, rings: 4, knuckle: 0.5 });
    const m = r('mand' + sd);
    sac(B, R('MAND'), 31, [m, add3(m, [k * 0.008 * s, -0.03 * s, 0.035 * s]), add3(m, [-k * 0.022 * s, -0.045 * s, 0.05 * s])], [[0.013 * s, 0.01 * s], [0.01 * s, 0.008 * s], [0.002, 0.002]], [W1('mand' + sd), W1('mand' + sd), W1('mand' + sd)], { n: 6 });
    // ---- the rib legs: thin, jointed, bristled, hooked at the end
    chain(B, x, R('LEG'), 32, { bones: ['xl1' + sd, 'xl2' + sd, 'xl3' + sd], tip: add3(r('xl3' + sd), [0.01 * k * s, -0.13 * s, 0.05 * s]), r: (t) => (0.014 - t * 0.008) * s, n: 6, rings: 3, knuckle: 0.4, bump: (a, t) => (hash(Math.round(a * 3), Math.round(t * 20)) - 0.5) * 0.5 });
    // where they come out: a split in the side, wet, a lip of wax round it
    const x1 = r('xl1' + sd);
    sac(B, R('HONEY'), 33, [add3(x1, [-k * 0.02 * s, 0.03 * s, 0]), add3(x1, [k * 0.005 * s, 0, 0]), add3(x1, [-k * 0.02 * s, -0.035 * s, 0])], [[0.012 * s, 0.01 * s], [0.026 * s, 0.022 * s], [0.012 * s, 0.01 * s]], [W1('chest'), W1('chest'), W1('chest')], { n: 6 });
  }
  // ---- the gaster: a bee's banded abdomen sagging out of the small of the back, a soft sting at its tip
  const g1 = r('g1'), g2 = r('g2');
  const gw = (t: number): Wt => (t < 0.4 ? [bi('g1'), 1 - t / 0.8, bi('spine'), t < 0.1 ? 0.5 : 0] : [bi('g2'), 1]);
  const gp: V3[] = [add3(g1, [0, 0.02 * s, 0.03 * s]), add3(g1, [0, -0.04 * s, -0.06 * s]), add3(g2, [0, 0.06 * s, 0.03 * s]), g2, add3(g2, [0, -0.1 * s, 0.0]), add3(g2, [0, -0.17 * s, 0.03 * s])];
  sac(B, R('GASTER'), 34, gp, [[0.07, 0.06], [0.12, 0.11], [0.15, 0.14], [0.14, 0.13], [0.09, 0.085], [0.015, 0.015]].map(([a, b]) => [a * s * bw, b * s] as [number, number]), gp.map((_, i) => gw(i / 5)), { n: 14, bump: (a, t) => fz(0.35, 11)(a, t) * (t > 0.1 && t < 0.9 ? 1 : 0.3) + Math.cos(t * Math.PI * 2 * 3.5) * 0.04 });
  // ---- comb breaking through the skin: a patch on the left shoulder blade, one low on the right side
  plate(B, R('COMB'), 35, add3(r('chest'), [0.09 * s, 0.13 * s, -0.1 * s]), [0.9, 0.0, 0.4], [0, 1, 0.1], 0.05 * s, 0.06 * s, 0.025 * s, W1('chest'), { rows: 4, cols: 4 });
  plate(B, R('COMB'), 36, add3(r('spine'), [-0.13 * s * bw, 0.06 * s, 0.03 * s]), [0.3, 0, 1], [0, 1, 0], 0.04 * s, 0.05 * s, 0.02 * s, W1('spine'), { rows: 4, cols: 4 });
  // ---- honey wax seeping: runs from the eye cluster, the corners of the mouth, the wrists, the sting
  const run = (bone: string, at: V3, len: number, r0: number, seed: number) => {
    const pts: V3[] = [at, add3(at, [(hash(seed, 1) - 0.5) * 0.01, -len * 0.5, 0.004]), add3(at, [(hash(seed, 2) - 0.5) * 0.015, -len, 0.006])];
    sac(B, R('HONEY'), 40 + seed, pts, [[r0, r0], [r0 * 0.7, r0 * 0.7], [r0 * 1.3, r0 * 1.3]], [W1(bone), W1(bone), W1(bone)], { n: 6, emis: 0.25 });
  };
  run('head', add3(H, [0.03 * s, 0.075 * s, 0.092 * s]), 0.06 * s, 0.007 * s, 1);
  run('head', add3(H, [0.045 * s, 0.08 * s, 0.08 * s]), 0.09 * s, 0.006 * s, 2);
  run('head', add3(H, [-0.024 * s, 0.02 * s, 0.09 * s]), 0.05 * s, 0.006 * s, 3);
  run('head', add3(H, [0.022 * s, 0.018 * s, 0.092 * s]), 0.07 * s, 0.006 * s, 4);
  for (const [sd] of SIDES) { const h = r('hand' + sd); run('farm' + sd, add3(h, [0, 0.03 * s, 0.025 * s]), 0.05 * s, 0.007 * s, 5 + (sd === 'L' ? 0 : 1)); }
  run('g2', add3(g2, [0, -0.15 * s, 0.03 * s]), 0.06 * s, 0.008 * s, 7);
  run('chest', add3(r('chest'), [0.12 * s, 0.1 * s, 0.06 * s]), 0.12 * s, 0.006 * s, 8);
}
const PAL = { y: 0xd8961e, k: 0x1e1a16 };
function paintK(p: Page, x: BuildCtx) {
  const v = x.variant;
  const Y = makeRamp(PAL.y, 7, { hueShift: 0.06, spread: 0.42, satShift: 0.15 }), K = makeRamp(PAL.k, 6, { spread: 0.22 });
  // fuzz: yellow and black strands, darker at the root
  const f = p.R('FUZZ');
  for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) {
    const band = ((yy >> 3) + (hash(xx >> 3, 7) < 0.5 ? 0 : 1)) % 2;
    const RR = band ? K : Y;
    const cell = (yy + Math.floor(hash(xx, 9 + v) * 4)) % 4;
    f.put(xx, yy, RR, RR.length * 0.35 + cell * 0.25 + (hash(xx * 3, yy * 5) - 0.5) * 0.8 - (yy > f.h * 0.8 ? 1 : 0), 0.45);
  }
  const ey = p.R('EYE');
  ey.fill(makeRamp(0x14161c, 5, { spread: 0.6 }), (xx, yy) => 1.3 + ((xx + (yy & 1)) % 2) * 0.5 + (Math.abs(ey.deg(xx)) < 50 && yy > 3 && yy < 8 ? 2.6 : 0) + (hash(xx, yy) - 0.5) * 0.6, undefined, 0.4);
  ey.set(7, 4, 0xffffff); ey.set(8, 4, 0xc8d0e0); ey.set(10, 6, 0x8890a8);
  const lg = p.R('LEG');
  lg.fill(makeRamp(0x2a2018, 5), (xx, yy) => 2 + (yy % 3 === 0 ? -0.8 : 0) + (hash(xx, yy) - 0.5) * 1.4 + Math.cos((lg.deg(xx) * Math.PI) / 180) * 0.6);
  const ga = p.R('GASTER');
  for (let yy = 0; yy < ga.h; yy++) for (let xx = 0; xx < ga.w; xx++) {
    const t = (yy + (hash(xx * 7, yy) - 0.5) * 3) / ga.h;
    const RR = t < 0.2 ? makeRamp(0xc8a088, 5, { spread: 0.3 }) : ((t * 6) | 0) % 2 ? K : Y;
    const th = (ga.deg(xx) * Math.PI) / 180;
    ga.put(xx, yy, RR, RR.length * 0.4 + 0.4 * Math.cos(th) - 0.2 + ((yy + Math.floor(hash(xx, 9) * 4)) % 4) * 0.2 + (hash(xx * 3, yy * 5) - 0.5) * 0.7 - (Math.abs(th) > 2.3 ? 0.8 : 0), 0.45);
  }
  // comb: a hex grid with honey in it
  const cb = p.R('COMB');
  cb.fill(makeRamp(0xd8a840, 5, { spread: 0.4 }), () => 2.5);
  for (let yy = 0; yy < cb.h; yy += 4) for (let xx = (yy >> 2) % 2 ? 2 : 0; xx < cb.w; xx += 4) { cb.rect(xx + 1, yy + 1, 2, 2, hash(xx, yy) < 0.5 ? 0x8a4a0a : 0xf0dca8); cb.set(xx + 1, yy + 1, 0xfff0b0); }
  p.R('HONEY').fill(makeRamp(0xd88a20, 5, { spread: 0.45 }), (xx, yy) => 2.5 + (hash(xx, yy) - 0.5) + (xx === 4 ? 1.5 : 0));
  p.R('MAND').fill(makeRamp(0x3a2414, 5, { spread: 0.5 }), (xx, yy) => 2 + (hash(xx, yy) - 0.5) * 1.2 + (yy < 4 ? 1 : 0));
  paintCap(p.R('CAP'), 0xe0c890, 0xc8a060, 0x3a1a10);
}
const KEEPER_KIT: KitDef = { key: 'bee_keeper', variants: MAX_SLOTS, W: 128, H: 128, bones: bonesK, layout: layoutK, build: buildK, paint: paintK, sphere: [0, 1.0, 0, 1.4] };
// the wings: four small smoky membranes on the shoulder blades
function layoutW(p: Page) { p.reg('WING', 32, 16); p.reg('CAP', 8, 8); }
function buildW(B: SkinB, x: BuildCtx) {
  const d = SLOTS[x.variant] ?? SLOTS[0], s = d.s;
  for (const [sd, k] of SIDES) for (const [w, L, Wd] of [['wF', 0.34, 0.1], ['wH', 0.24, 0.07]] as const) {
    const r = x.rest(w + sd), id = x.bi(w + sd);
    const pts: V3[] = [0, 0.3, 0.6, 0.85, 1].map((t) => [r[0] + k * L * s * t * 0.75, r[1] + 0.06 * s * Math.sin(t * Math.PI) - t * 0.08 * s, r[2] - L * s * 0.55 * t]);
    blade(B, x.R('WING'), pts, [Wd * s * 0.25, Wd * s * 0.8, Wd * s, Wd * s * 0.8, Wd * s * 0.1], [0, 1, 0], pts.map(() => [id, 1]), { offset: -0.35, edge: 0.2, seed: k + 9 });
  }
}
function paintW(p: Page) {
  const r = p.R('WING');
  r.fill(makeRamp(0xc8c0a8, 5, { spread: 0.4 }), (xx, yy) => 2.6 + (r.fbm(xx, yy, 2, 2, 7) - 0.5) * 1.2 - (yy / r.h) * 0.8);
  for (let i = 0; i < 5; i++) r.line(0, r.h * (0.2 + i * 0.15), r.w, r.h * (0.1 + i * 0.2), 0x3a3020, 0.7);
  // torn: ragged holes the wax has run into
  for (let i = 0; i < 3; i++) r.ellipse(hash(i, 3) * r.w, hash(i, 4) * r.h, 2, 1.5, 0xd8902a, 0.8);
  paintCap(p.R('CAP'), 0xc8c0b0, 0xa8a090, 0x605848);
}
const WING_KIT: KitDef = { key: 'bee_keeper_wing', variants: MAX_SLOTS, W: 64, H: 32, bones: bonesK, layout: layoutW, build: buildW, paint: paintW, sphere: [0, 1.3, -0.2, 0.8] };

// ------------------------------------------------------------------ the overlay on a HumanRig (keepers, and Still Lifes turning)
interface Overlay { slot: number; mesh: THREE.SkinnedMesh; wings: THREE.SkinnedMesh; extra: Record<string, THREE.Group>; F: KitFx }
const OVER = new WeakMap<HumanRig, Overlay>();
/** the bee growths bound onto this HumanRig's skeleton (rebuilt if the body changed shape) */
export function keeperOverlay(hr: HumanRig): Overlay {
  const slot = slotOf(hr.dims);
  let o = OVER.get(hr);
  if (o && o.slot === slot) return o;
  if (o) { o.mesh.removeFromParent(); o.wings.removeFromParent(); for (const g of Object.values(o.extra)) g.removeFromParent(); }
  const e = kitEntry(KEEPER_KIT, slot), ew = kitEntry(WING_KIT, slot);
  const F = kitFx();
  const extra: Record<string, THREE.Group> = {};
  const nodes: THREE.Object3D[] = BONES.map((b) => hr.bones[b]);
  e.bones.forEach((b, i) => {
    if (i < BONES.length) return;
    const g = new THREE.Group(); g.name = 'bk:' + b.name;
    g.position.set(b.at[0], b.at[1], b.at[2]); g.userData.p0 = g.position.clone();
    (extra[b.parent] ?? (hr.bones as any)[b.parent]).add(g);
    extra[b.name] = g; nodes.push(g);
  });
  const inv = e.rest.map((r) => new THREE.Matrix4().makeTranslation(-r[0], -r[1], -r[2]));
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6); m.frustumCulled = false;
    (m as any).clone = () => new THREE.Group();
    hr.body.add(m);
    m.bind(new THREE.Skeleton(nodes as unknown as THREE.Bone[], inv.map((q) => q.clone())), new THREE.Matrix4());
    return m;
  };
  const mesh = mk(e.geo, kitMaterial(e.tex, F), 'keeperGrowth');
  const wings = mk(ew.geo, filmKitMaterial(ew.tex, F, { opacity: 0.55, edge: 0.9, spec: 1.2, rim: 0.3, doubleSide: true }), 'keeperWings');
  wings.renderOrder = 2;
  o = { slot, mesh, wings, extra, F };
  OVER.set(hr, o);
  return o;
}
interface ExtraDrive { t: number; growth: number; buzz: number; sting: number; quest: number; chew: number; still: number; dead: number; seed: number }
/** animate the bee parts: antennae questing, mandibles working, rib legs never still, wings folded or buzzing, the gaster pumping */
function poseExtra(o: Overlay, d: ExtraDrive) {
  const X = o.extra, t = d.t, s7 = d.seed * 7, live = (1 - d.dead) * (1 - d.still * 0.85), g = d.growth;
  // growing in: the overlay dithers in, the bigger parts scale up out of the body
  o.F.fx.value.w = g >= 0.999 ? 0 : Math.min(0.95, 1 - g * 1.05);
  const grow = (n: string, k: number) => { const b = X[n]; if (b) b.scale.setScalar(Math.max(0.001, Math.min(1, (g - k) / (1 - k)))); };
  grow('g1', 0.25); grow('xl1L', 0.45); grow('xl1R', 0.55); grow('antL1', 0.35); grow('antR1', 0.4); grow('wFL', 0.6); grow('wFR', 0.62); grow('wHL', 0.65); grow('wHR', 0.68); grow('mandL', 0.5); grow('mandR', 0.5);
  for (const [sd, k] of SIDES) {
    X['ant' + sd + '1']?.rotation.set(-0.3 + Math.sin(t * 1.9 + k + s7) * 0.35 * live + d.quest * -0.4, k * (0.25 + Math.sin(t * 1.3 + k) * 0.3 * live), k * 0.2);
    X['ant' + sd + '2']?.rotation.set(0.6 + Math.sin(t * 2.7 + k * 2) * 0.4 * live - d.quest * 0.3, 0, 0);
    X['mand' + sd]?.rotation.set(0, k * (Math.max(0, Math.sin(t * (4 + d.chew * 9) + k)) * (0.25 + d.chew * 0.35) * live + d.sting * 0.3), 0);
    // rib legs: they move on their own, paddling, clutching at nothing
    X['xl1' + sd]?.rotation.set(Math.sin(t * 2.3 + k * 1.7 + s7) * 0.4 * live, k * Math.sin(t * 1.7 + k) * 0.3 * live, k * (0.2 + Math.sin(t * 3.1 + k) * 0.25 * live) + d.buzz * k * 0.5);
    X['xl2' + sd]?.rotation.set(Math.sin(t * 2.9 + k + 1) * 0.5 * live, 0, k * Math.sin(t * 2.2 + k) * 0.3 * live);
    X['xl3' + sd]?.rotation.set(Math.max(0, Math.sin(t * 4.1 + k * 3)) * 0.7 * live, 0, 0);
    // wings: folded down the back; now and then a useless buzz; a blur when it is threatened
    const buzz = Math.max(d.buzz, Math.sin(t * 0.23 + s7) > 0.9 ? 1 : 0) * live;
    for (const [w, ph] of [['wF', 0], ['wH', 0.6]] as const) {
      const o2 = X[w + sd]; if (!o2) continue;
      const beat = Math.sin(t * 85 + ph) * buzz;
      o2.rotation.set(-0.25 + beat * 0.25 - buzz * 0.2, k * (0.5 - buzz * 0.45), k * (-0.4 + beat * 0.8 + buzz * 0.5));
    }
  }
  // the gaster: breathing, pumping; stinging, it swings forward between the legs
  const pump = Math.sin(t * (3 + d.buzz * 4) + s7) * live;
  X.g1?.rotation.set(0.25 + d.sting * 1.5 + pump * 0.05 + d.dead * 0.4, Math.sin(t * 0.7) * 0.08 * live, 0);
  X.g2?.rotation.set(0.15 + d.sting * 0.6, 0, 0);
  X.g2?.scale.set(1 + pump * 0.04, 1 + pump * 0.06, 1);
  o.F.fx.value.y += 1 / 60;
}

// ------------------------------------------------------------------ the page: fuzz and honey painted through the wax
function beeify(d: Uint8Array | Uint8ClampedArray, seed: number) {
  const S = 256;
  const h = (a: number, b: number) => hash(a + seed * 0.01, b + seed * 0.013);
  const blend = (x: number, y: number, c: number, t: number) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    d[i] = d[i] + (((c >> 16) & 255) - d[i]) * t; d[i + 1] = d[i + 1] + (((c >> 8) & 255) - d[i + 1]) * t; d[i + 2] = d[i + 2] + ((c & 255) - d[i + 2]) * t;
  };
  const regs = [REG.TORSO, REG.ARM_L, REG.ARM_R, REG.NECK, REG.LEG_L, REG.LEG_R, REG.HAIR];
  // fuzz patches: clumps of yellow and black hair grown through skin and cloth
  for (const R of regs) {
    const n = Math.round((R.w * R.h) / 260);
    for (let k = 0; k < n; k++) {
      const cx = R.x + h(k, R.x) * R.w, cy = R.y + h(k + 7, R.y) * R.h * (R === REG.LEG_L || R === REG.LEG_R ? 0.45 : 1);
      const rx = 3 + h(k, 3) * 6, ry = 2 + h(k, 4) * 5, band = h(k, 5) < 0.5;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (x < R.x || x >= R.x + R.w || y < R.y || y >= R.y + R.h) continue;
        const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (q > 1 || h(x, y) < q * 0.6) continue;
        const strand = (y + Math.floor(h(x, 9) * 3)) % 3;
        const c = (band ? (y - cy) % 4 < 2 : (x - cx) % 5 < 2) ? [0x1e1a16, 0x2e2820, 0x3a3228][strand] : [0xb87a10, 0xd8961e, 0xf0b840][strand];
        blend(x, y, c, 0.85);
      }
    }
  }
  // honey wax runs: from points high on each region, downward (rows run down the body), a bright drop at the end
  for (const R of [REG.TORSO, REG.ARM_L, REG.ARM_R, REG.NECK]) {
    const n = Math.round(R.w / 9);
    for (let k = 0; k < n; k++) {
      const x0 = Math.floor(R.x + h(k, 11) * R.w), y0 = Math.floor(R.y + h(k, 12) * R.h * 0.5), len = 6 + Math.floor(h(k, 13) * R.h * 0.4);
      for (let y = y0; y < Math.min(R.y + R.h, y0 + len); y++) { const x = x0 + Math.round(Math.sin(y * 0.3 + k) * 0.6); blend(x, y, 0xd88a20, 0.8); blend(x + 1, y, 0x8a4a10, 0.35); }
      blend(x0, Math.min(R.y + R.h - 1, y0 + len), 0xfff0b0, 0.9);
    }
  }
}

// ------------------------------------------------------------------ the rig (pooled: each HumanRig owns a texture page)
interface KRig extends Rig { hr: HumanRig; who: string; m: Record<string, any>; held: THREE.Mesh | null; heldKey: string; cut: CutState }
const POOL: KRig[] = [];
function newRig(): KRig {
  const hr = new HumanRig(MEMORIES[0].app, worldMaterial({}));
  (hr.skin as any).clone = () => new THREE.Group();
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(hr.root);
  const r: KRig = { root, body, parts: { ...hr.j }, headY: 1.7, hr, who: '', m: {}, held: null, heldKey: '', cut: null as unknown as CutState };
  POOL.push(r);
  return r;
}
function buildKRig(): Rig {
  for (const r of POOL) if (!r.root.parent) { r.root.userData = {}; r.root.position.set(0, 0, 0); r.root.rotation.set(0, 0, 0); r.body.rotation.set(0, 0, 0); r.body.visible = true; r.m = {}; return r; }
  return newRig();
}
/** dress the rig as the Still Life it was (memory index), the bees grown through it */
function adoptK(R: KRig, mi: number) {
  const key = 'k:' + mi;
  if (R.who === key) return;
  const mem = MEMORIES[mi % MEMORIES.length];
  R.hr.outfit = mem.outfit;
  R.hr.setAppearance(mem.app);
  waxify(pageData(R.hr), mem, mi * 7919);
  beeify(pageData(R.hr), mi * 131 + 7);
  replicaTex(R.hr).needsUpdate = true;
  R.cut = cutState(BONES.map((b) => R.hr.bones[b]), R.hr.skin.skeleton);
  R.who = key;
  const o = keeperOverlay(R.hr);
  R.parts = { ...R.hr.j, ...Object.fromEntries(Object.entries(o.extra)) };
}
/** a keeper rig wearing memory `mi` (stand-alone: the video stages this) */
export function buildBeeKeeper(mi = ADULT_MEMORIES[1]): Rig { const R = buildKRig() as KRig; adoptK(R, mi); return R; }

// ------------------------------------------------------------------ poses
type Mode = 'idle' | 'walk' | 'watch' | 'mimic' | 'inspect' | 'buzz' | 'sting' | 'wake' | 'flee' | 'dead';
const set = (p: HPose, j: keyof HPose, x: number, y = 0, z = 0) => { (p as any)[j] = [x, y, z]; };
const add = (p: HPose, j: keyof HPose, x: number, y = 0, z = 0) => { const v = p[j] as [number, number, number] | undefined; if (v) { v[0] += x; v[1] += y; v[2] += z; } else (p as any)[j] = [x, y, z]; };
const POSES = new Map<string, HPose>();
function basePose(kind: 'stand' | 'kneel' | 'sit', m: Record<string, any>): HPose {
  let b = POSES.get(kind); if (!b) { b = replicaPose(kind, 0.3); POSES.set(kind, b); }
  const out: HPose = (m.scratch ??= {});
  for (const k of Object.keys(out)) delete (out as any)[k];
  for (const [k, v] of Object.entries(b)) (out as any)[k] = Array.isArray(v) ? v.slice() : v;
  return out;
}
/** the forearms held up and folded against the chest like a bee's forelegs, the hands limp */
function insectArms(P: HPose, t: number, k: number, seed: number) {
  set(P, 'uarmL', -0.55 * k + 0.02, 0.35 * k, 0.12); set(P, 'uarmR', -0.55 * k + 0.02, -0.35 * k, -0.12);
  set(P, 'farmL', -1.75 * k - 0.06, 0, 0); set(P, 'farmR', -1.75 * k - 0.06, 0, 0);
  set(P, 'handL', 0.6 * k, 0.3, 0.2 * k); set(P, 'handR', 0.6 * k, -0.3, -0.2 * k);
  // the fingers rub together, like a fly cleaning itself
  add(P, 'handL', Math.sin(t * 7 + seed) * 0.12 * k, 0, Math.sin(t * 9) * 0.1 * k); add(P, 'handR', Math.sin(t * 7 + seed + 2) * 0.12 * k, 0, -Math.sin(t * 9 + 1) * 0.1 * k);
  P.gripL = 0.35 + 0.2 * Math.sin(t * 5); P.gripR = 0.35 + 0.2 * Math.sin(t * 5 + 1);
}
/** a head that moves like an insect's: holds, then snaps to a new angle */
function snapHead(m: Record<string, any>, t: number, seed: number, yaw: number, dt: number) {
  if (t > (m.hsT ?? 0)) { m.hsT = t + 0.25 + hash(Math.floor(t * 3), seed) * 0.9; m.hy = (hash(Math.floor(t * 5), seed + 1) - 0.5) * 0.7; m.hz = (hash(Math.floor(t * 5), seed + 2) - 0.5) * 1.1; m.hx = (hash(Math.floor(t * 5), seed + 3) - 0.3) * 0.4; }
  const k = Math.min(1, dt * 22);
  m.cy = (m.cy ?? 0) + ((m.hy ?? 0) + yaw - (m.cy ?? 0)) * k; m.cz = (m.cz ?? 0) + ((m.hz ?? 0) - (m.cz ?? 0)) * k; m.cx = (m.cx ?? 0) + ((m.hx ?? 0) - (m.cx ?? 0)) * k;
  return [m.cx, m.cy, m.cz];
}
interface KDrive { t: number; dt: number; mode: Mode; speed: number; yaw: number; mimic: string; atk: number; wake: number; flinch: number; seed: number; growth: number }
function poseK(R: KRig, d: KDrive) {
  const m = R.m, t = d.t, sd = d.seed;
  let P: HPose;
  if (d.mode === 'walk' || d.mode === 'flee') {
    const inp: AnimInput = { speed: d.speed, stance: 'stand', full: '', action: '', actionT: 0, actionDur: 1, twoHanded: false, limp: 0.35, tired: 0, panic: d.mode === 'flee' ? 0.6 : 0, cold: 0, aimPitch: 0, holdingLight: false, holding: false, lookYaw: 0, fidget: false } as AnimInput;
    P = R.hr.anim.update(d.dt, inp);
    insectArms(P, t, 1, sd);
    add(P, 'spine', 0.22); add(P, 'chest', 0.1);
    // a skitter: every few steps a jerk sideways, like a fly's walk
    if (Math.sin(t * 5.3 + sd) > 0.9) { P.rootX = (P.rootX ?? 0) + 0.04; add(P, 'neck', 0, 0, 0.3); }
  } else if (d.mode === 'dead') {
    P = basePose('stand', m);
  } else {
    P = basePose(d.mode === 'mimic' && d.mimic === 'crouch' ? 'kneel' : d.mode === 'wake' && d.wake < 0.5 ? 'sit' : 'stand', m);
    insectArms(P, t, d.mode === 'wake' ? Math.min(1, d.wake * 1.5) : 1, sd);
    add(P, 'spine', 0.2); add(P, 'chest', 0.08);
    // breathing through the gaster: the whole torso lifts and drops
    add(P, 'chest', Math.sin(t * 3.1 + sd) * 0.03);
    if (d.mode === 'inspect') {
      // the thing held up to the eye clusters in both hands, turned over and over
      set(P, 'uarmL', -1.0, 0.45, 0.1); set(P, 'uarmR', -1.05, -0.45, -0.1);
      set(P, 'farmL', -1.25, 0, 0); set(P, 'farmR', -1.2, 0, 0);
      set(P, 'handL', 0.3 + Math.sin(t * 1.3) * 0.4, Math.sin(t * 0.9) * 0.6, 0.3); set(P, 'handR', 0.3 + Math.sin(t * 1.3 + 0.5) * 0.4, -0.4 + Math.sin(t * 0.9) * 0.6, -0.3);
      add(P, 'neck', 0.3); add(P, 'head', 0.25, 0, Math.sin(t * 0.7) * 0.4); add(P, 'spine', 0.15);
      P.gripL = 0.6; P.gripR = 0.7;
    } else if (d.mode === 'buzz') {
      // the threat display: arms thrown wide, head back, the gaster curling under
      set(P, 'uarmL', -0.4, 0.2, 1.3); set(P, 'uarmR', -0.4, -0.2, -1.3); set(P, 'farmL', -0.9, 0, 0); set(P, 'farmR', -0.9, 0, 0);
      set(P, 'handL', 0, 0, 0.4); set(P, 'handR', 0, 0, -0.4); P.gripL = 1; P.gripR = 1;
      add(P, 'head', -0.35 + Math.sin(t * 30) * 0.05, 0, Math.sin(t * 13) * 0.15); add(P, 'spine', -0.1);
      P.rootX = (P.rootX ?? 0) + Math.sin(t * 40) * 0.01;
    } else if (d.mode === 'sting') {
      // it lunges, bending double, the sting driven forward between its legs
      const a = d.atk;
      add(P, 'spine', 0.5 * a); add(P, 'chest', 0.2 * a); P.rootZ = (P.rootZ ?? 0) + 0.18 * a;
      set(P, 'uarmL', -1.3 * a, 0.3, 0.3); set(P, 'uarmR', -1.3 * a, -0.3, -0.3); set(P, 'farmL', -0.5, 0, 0); set(P, 'farmR', -0.5, 0, 0);
      set(P, 'thighL', -0.5 * a, 0, 0.15); set(P, 'thighR', -0.4 * a, 0, -0.15); set(P, 'shinL', 0.7 * a, 0, 0); set(P, 'shinR', 0.6 * a, 0, 0);
      P.rootY = (P.rootY ?? 0) - 0.12 * a;
    } else if (d.mode === 'mimic') {
      // copying the unit: the stance, the light held up, the arms, the stillness; a beat late and slightly wrong
      if (d.mimic === 'torch') { set(P, 'uarmR', -1.35, -0.1, -0.1); set(P, 'farmR', -0.25, 0, 0); P.gripR = 1; }
      else if (d.mimic === 'arms') { set(P, 'uarmL', -0.4, 0, 0.5 + Math.sin(t * 6) * 0.3); set(P, 'uarmR', -0.4, 0, -0.5 - Math.sin(t * 6) * 0.3); set(P, 'farmL', -0.6, 0, 0); set(P, 'farmR', -0.6, 0, 0); }
      else if (d.mimic === 'still') { set(P, 'uarmL', 0.02, 0, 0.06); set(P, 'uarmR', 0.02, 0, -0.06); set(P, 'farmL', -0.08, 0, 0); set(P, 'farmR', -0.08, 0, 0); add(P, 'spine', -0.18); }
      else if (d.mimic === 'wave') { set(P, 'uarmR', -2.4, 0, -0.3); set(P, 'farmR', -0.4 + Math.sin(t * 8) * 0.4, 0, 0); }
    } else if (d.mode === 'wake') {
      // coming to: violent twitches as the wax lets go of it
      const w = d.wake;
      if (Math.sin(t * 17) > 0.6) { add(P, 'head', Math.sin(t * 41) * 0.4 * (1 - w), 0, Math.sin(t * 23) * 0.5); add(P, 'chest', Math.sin(t * 37) * 0.2 * (1 - w)); }
      P.rootY = (P.rootY ?? 0) * (1 - Math.min(1, w * 1.4));
    }
  }
  // the head: watching (the yaw toward its subject), in snaps
  const [hx, hy, hz] = snapHead(m, t, sd, d.mode === 'inspect' ? 0 : d.yaw, d.dt);
  add(P, 'neck', hx * 0.4, hy * 0.35, hz * 0.3); add(P, 'head', hx * 0.6, hy * 0.65, hz * 0.7);
  if (d.flinch > 0) { P.rootX = (P.rootX ?? 0) + Math.sin(t * 80) * 0.025 * d.flinch; add(P, 'head', 0, 0, Math.sin(t * 60) * 0.2 * d.flinch); }
  P.blink = 0;
  R.hr.applyPose(P);
  R.hr.fx.value.y += d.dt;
  poseExtra(keeperOverlay(R.hr), { t, growth: d.growth, buzz: d.mode === 'buzz' ? 1 : d.mode === 'flee' ? 0.6 : d.mode === 'wake' ? 1 - d.wake : 0, sting: d.mode === 'sting' ? d.atk : 0, quest: d.mode === 'watch' || d.mode === 'mimic' ? 1 : 0, chew: d.mode === 'inspect' ? 1 : 0, still: 0, dead: d.mode === 'dead' ? 1 : 0, seed: sd });
}
/** the item it is turning over, in its right hand */
function holdItem(R: KRig, key: string) {
  if (R.heldKey === key) return;
  R.heldKey = key;
  if (R.held) { R.held.removeFromParent(); R.held = null; }
  if (!key) return;
  const g = itemGeometry(key);
  if (!g) return;
  R.held = new THREE.Mesh(g, worldMaterial({}));
  R.held.castShadow = true;
  R.held.position.set(0.02, -0.02, 0.06);
  R.hr.heldR.add(R.held);
}

function animateK(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as KRig, n = netOf(c);
  const mi = typeof n.mi === 'number' ? n.mi : ADULT_MEMORIES[Math.floor(hashId(c.id, 3) * ADULT_MEMORIES.length)];
  if (R.who !== 'k:' + mi) adoptK(R, mi);
  cutSync(R.cut, R.hr.body);
  const m = R.m, seed = hashId(c.id, 5) * 50;
  const mode: Mode = c.dead ? 'dead' : ((n.md as Mode) || (c.speed > 0.05 ? 'walk' : 'idle'));
  const lp = localIn(c);
  const tp = n.tp ? (G.players.get(n.tp) as Player | undefined) : lp ?? undefined;
  const yaw = tp && !c.dead ? Math.max(-1.4, Math.min(1.4, -angd(Math.atan2(tp.z - c.z, tp.x - c.x), c.facing))) : 0;
  m.wk = mode === 'wake' ? Math.min(1, (m.wk ?? 0) + dt / 4) : 1;
  const atk = c.attackPhase > 0 ? Math.min(1, (0.38 - c.attackPhase) / 0.2 + 0.3) : Math.max(0, (m.atk ?? 0) - dt * 3);
  m.atk = atk;
  holdItem(R, c.dead ? '' : (n.hi ?? ''));
  poseK(R, { t, dt, mode: c.attackPhase > 0 ? 'sting' : mode === 'walk' || mode === 'flee' ? (c.speed > 0.05 ? mode : 'watch') : mode, speed: c.speed, yaw, mimic: n.mm ?? 'still', atk, wake: m.wk, flinch: flinchOf(c), seed, growth: 1 });
  R.hr.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.35;
  if (lp && !c.dead && c.visibleToLocal) {
    const d = dist(lp, c);
    if (mode === 'mimic' && d < 10) thinkOnce(lp, 'keeper_mimic', ['It is standing the way I am standing.', 'It copied me. A second late. Like a mirror that has to think about it.'][Math.floor(t * 0.2) % 2], 60);
    else if (mode === 'inspect' && d < 10) thinkOnce(lp, 'keeper_inspect', 'It picked up what I dropped and it is turning it over and over, right up against those eyes.', 70);
    else if (mode === 'buzz' && d < 6) thinkOnce(lp, 'keeper_buzz', 'It has nowhere to go. Its wings are going. Back off. BACK OFF.', 20);
    else if (d < 9) thinkOnce(lp, 'bee_keeper', ['It was a person. A wax person. The bees got into it.', 'It has eyes like a bee\'s. Clusters of them. All looking at me.', 'There are legs coming out of its ribs. They keep moving.', 'It is following me. Not close. Just... keeping me in view.'][Math.floor(t * 0.11) % 4], 80);
  }
}
const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// ------------------------------------------------------------------ host brain: curious, follows, watches, mimics, inspects; stings only when cornered
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
/** open tiles behind it, away from (fx, fz): fewer than two and it is cornered */
function cornered(c: Creature, z: Zone, fx: number, fz: number): boolean {
  const a = Math.atan2(c.z - fz, c.x - fx);
  let open = 0;
  for (const da of [-0.9, -0.45, 0, 0.45, 0.9]) {
    let ok = true;
    for (const r of [1, 2]) { const x = c.x + Math.cos(a + da) * r, y = c.z + Math.sin(a + da) * r; if (!walkable(z, Math.floor(x), Math.floor(y)) || !lineOfSightB(z, c.x, c.z, x, y)) { ok = false; break; } }
    if (ok) open++;
  }
  return open < 2;
}
function mimicOf(p: Player): string {
  if (p.stance === 'sneak' || p.stance === 'crawl') return 'crouch';
  if (p.flashlightOn) return 'torch';
  if (p.running) return 'arms';
  if ((p.speed ?? 0) < 0.1 && /wave|emote/.test(String(p.actionAnim ?? ''))) return 'wave';
  return 'still';
}
function thinkK(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  if (!m.init) { m.init = 1; if (typeof n.mi !== 'number') n.mi = ADULT_MEMORIES[Math.floor(hashId(c.id, 3) * ADULT_MEMORIES.length)]; restoreStore(c, 'hold'); }
  m.mdT = (m.mdT ?? 0) + dt;
  const md: string = n.md ?? '';
  if (md === 'wake') { stop(c); c.setState('emerge'); if (m.mdT > 4.5) setMd(c, ''); return true; }
  if (ev.hurt > 0) { m.scared = G.time + 14; if (n.hi) { dropStored(c, 'hold'); n.hi = ''; } }
  // the nearest unit it can see
  let tp: Player | null = null, td = 1e9;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < 16 && d < td && lineOfSightB(z, c.x, c.z, p.x, p.z)) { tp = p; td = d; } }
  n.tp = tp?.id ?? '';
  const scared = (m.scared ?? 0) > G.time;
  // ---- too close: a cornered keeper buzzes, then stings; otherwise it backs away
  if (tp && td < (scared ? 2.4 : 1.6) && !c.attackPhase) {
    if (cornered(c, z, tp.x, tp.z) || (scared && td < 1.3)) {
      faceTo(c, tp.x, tp.z); stop(c);
      if (md !== 'buzz') { setMd(c, 'buzz'); c.setState('warn'); playAt('gloam_hiss', c, 0.9, 14, 0.7); playAt('limb_flies', c, 0.8, 12, 1.4); }
      if (m.mdT > 1.2 && c.attackT <= 0) { attack(c, tp); playAt('ventling_squeal', c, 0.9, 14, 0.8); m.mdT = 0.6; }
      return true;
    }
    setMd(c, 'flee'); c.setState('flee');
    if (!c.goal || c.stateT > 2) { c.goal = cs.fleeSpot(c, z, tp.x, tp.z); c.stateT = 0; }
    cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run * 0.6, dt, 0.5);
    return true;
  }
  if (scared && tp && td < 7) {
    setMd(c, 'flee'); c.setState('flee');
    if (!c.goal || c.stateT > 3) { c.goal = cs.fleeSpot(c, z, tp.x, tp.z); c.stateT = 0; }
    cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run * 0.7, dt, 0.5);
    return true;
  }
  if (md === 'buzz' || md === 'flee') setMd(c, '');
  // ---- turning something over in its hands
  if (md === 'inspect') {
    stop(c); c.setState('curious');
    if (tp && td < 6) faceTo(c, tp.x, tp.z);
    if (c.noiseCooldown <= 0 && rng.chance(dt * 0.5)) { playAt('ventling_chitter', c, 0.5, 9, 1.1); c.noiseCooldown = 3; }
    if (m.mdT > (m.inspT ?? 8)) { dropStored(c, 'hold'); n.hi = ''; setMd(c, ''); m.inspCool = G.time + rng.float(18, 40); }
    return true;
  }
  // ---- something on the floor it has not seen before
  if (G.time > (m.inspCool ?? 0) && (!tp || td > 2.5)) {
    let want = m.want as { uid: number; x: number; z: number } | null;
    if (!want && (m.lookT ?? 0) < G.time) {
      m.lookT = G.time + 3;
      const items = floorItemsAround(z, c.x, c.z, 7).filter((wi) => (wi.y ?? 0) < 0.6 && !(m.seen ?? {})[wi.item.uid]);
      items.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
      if (items[0]) want = m.want = { uid: items[0].item.uid, x: items[0].x, z: items[0].z };
    }
    if (want) {
      const wi = floorItemsAround(z, want.x, want.z, 0.6).find((w) => w.item.uid === want!.uid);
      if (!wi) { m.want = null; }
      else {
        setMd(c, ''); c.setState('investigate');
        m.wantT = (m.wantT ?? 0) + dt;
        if (cs.moveTo(c, z, wi.x, wi.z, c.sp.walk, dt, 0.6)) {
          (m.seen ??= {})[wi.item.uid] = 1;
          takeFloorItem(c, wi, 'hold'); n.hi = wi.item.key;
          setMd(c, 'inspect'); m.inspT = rng.float(6, 11); m.want = null; m.wantT = 0;
          playAt('still_neck', c, 0.6, 10, 1.3);
        } else if (m.wantT > 14) { (m.seen ??= {})[want.uid] = 1; m.want = null; m.wantT = 0; }
        return true;
      }
    }
  }
  // ---- a unit: follow at a polite distance, stop and watch, copy it
  if (tp) {
    const pm = tp.speed ?? 0;
    if (td > 6.5) {
      setMd(c, ''); c.setState('follow');
      const a = Math.atan2(c.z - tp.z, c.x - tp.x);
      cs.moveTo(c, z, tp.x + Math.cos(a) * 4.5, tp.z + Math.sin(a) * 4.5, td > 11 ? c.sp.run * 0.55 : c.sp.walk, dt, 0.6);
      return true;
    }
    if (td < 3.2) {
      // a step back: it keeps you exactly in view, never quite in reach
      setMd(c, ''); c.setState('watch');
      const a = Math.atan2(c.z - tp.z, c.x - tp.x);
      if (cs.moveTo(c, z, tp.x + Math.cos(a) * 4, tp.z + Math.sin(a) * 4, c.sp.walk * 0.8, dt, 0.3)) faceTo(c, tp.x, tp.z);
      return true;
    }
    stop(c); faceTo(c, tp.x, tp.z);
    // looked at, or the unit standing still: it starts copying
    const lookedAt = Math.cos(angd(tp.facing, Math.atan2(c.z - tp.z, c.x - tp.x))) > 0.8;
    if (md === 'mimic') {
      n.mm = mimicOf(tp);
      if (m.mdT > (m.mimT ?? 7) || pm > 1.6) setMd(c, 'watch');
    } else {
      if (md !== 'watch') setMd(c, 'watch');
      c.setState('watch');
      if (m.mdT > 2.5 && (lookedAt || rng.chance(dt * 0.15))) { setMd(c, 'mimic'); m.mimT = rng.float(5, 9); n.mm = mimicOf(tp); c.setState('mimic'); playAt('still_creak', c, 0.5, 9, 1.4); }
    }
    if (c.noiseCooldown <= 0 && rng.chance(dt * 0.2)) { playAt(rng.chance(0.5) ? 'ventling_chitter' : 'still_neck', c, 0.45, 10, 1.2); c.noiseCooldown = 4; }
    return true;
  }
  // ---- nobody about: it wanders, slowly, stopping to look at things
  if (md === 'watch' || md === 'mimic') setMd(c, '');
  c.setState('wander');
  if (md === 'idle') { stop(c); if (m.mdT > (m.idleT ?? 4)) setMd(c, ''); return true; }
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk * 0.7, dt, 0.6) || c.stateT > 16) {
    if (c.goal && rng.chance(0.5)) { setMd(c, 'idle'); m.idleT = rng.float(3, 8); c.goal = null; return true; }
    c.goal = findSpot(c, { rMin: 2, rMax: 9 }) ?? cs.wanderSpot(c, z, 9);
    c.stateT = 0;
  }
  return true;
}

const KEEPER = def({
  key: 'bee_keeper', name: 'Bee Keeper', code: 'LG-04 // REMNANT, APID-COLONISED', temperament: 'curious', threat: 2,
  rule: { name: 'LEAVE IT A WAY OUT', text: 'Curious, not hungry. It follows at a distance, watches, copies how you move, and takes whatever you drop to look at it. It only stings when it is cornered or hurt and cannot get away. Give it room and it gives you room.', tell: 'A person with bee parts growing out of them. It is just standing there, watching me, head on one side.' },
  hp: 85, walk: 0.9, run: 2.3, turn: 4, radius: 0.27, height: 1.75, sight: 13, fov: 1.5, hearing: 0.8,
  attack: { dmg: [9, 15], range: 1.0, cooldown: 1.8, kinds: ['laceration', 'deep'], corrupt: 0.04, knock: 0.35, parts: ['torso_u', 'torso_l', 'thigh_l', 'thigh_r', 'groin'] },
  zones: ['ledge'], weight: 0.5, maxPerZone: 2, group: [1, 1], diet: 'none',
  sounds: { idle: 'ventling_chitter', alert: 'still_neck', attack: 'ventling_squeal', hurt: 'still_crack', death: 'still_fall', step: 'still_creak' } as any,
  scan: {
    cls: 'Remnant / Still Life, colonised by apids',
    notes: [
      'A Still Life the Giant Bumble Bees fed on until they grew into it: human, with bee parts.',
      'Fuzz through the skin, clusters of compound eyes on the face, antennae, mandibles, legs out of the ribs, a bee\'s abdomen out of the back, wings too small to lift it. It seeps honey wax.',
      'Curious: it follows, watches, copies how you stand and move, and picks up what you drop to look at it.',
      'It stings only when cornered or hurt. Leave it a way out.',
    ],
  },
  gore: { blood: 'dark', tint: 0xc8902a, flesh: 0xd8b060, sever: ['uarmL', 'uarmR', 'farmL', 'farmR', 'thighL', 'thighR', 'head'], head: 'head' },
  remains: 'lg_puddle',
  build: buildKRig, animate: animateK, think: thinkK,
});
(KEEPER as any).handlesSevered = true;
bus.on('creatureKilled', (c: Creature) => { if (c?.sp?.key === 'bee_keeper' && G.role !== 'client') { dropStored(c, 'hold'); net(c).hi = ''; } });

// ------------------------------------------------------------------ how they happen: the bees eat the wax off a Still Life, and grow into it
const BZ_STEP = 0.13;
/** host: a Still Life near (c) the bees can feed on (sat or stood still somewhere) */
export function stillLifeNear(c: Creature, r: number, skip?: (id: string) => boolean): Creature | null {
  let best: Creature | null = null, bd = r;
  for (const o of CS().creatures.values()) {
    if (o.zoneKey !== c.zoneKey || o.dead || o.sp.key !== 'still_life' || skip?.(o.id)) continue;
    const no = netOf(o);
    if (no.ps === 'walk' || no.ps === 'strangle') continue;
    const d = dist(o, c);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
/** host: one bee's meal of wax off a Still Life; enough of them and it gets up a Bee Keeper */
export function waxFeed(sl: Creature) {
  const n = net(sl);
  n.bz = Math.min(1, +((n.bz ?? 0) + BZ_STEP).toFixed(3));
  playAt('still_creak', sl, 0.6, 10, 0.8);
  if (n.bz >= 1) convert(sl);
}
function convert(sl: Creature) {
  const cs = CS(), n = netOf(sl);
  const mi = typeof n.mi === 'number' ? n.mi : ADULT_MEMORIES[0];
  const x = sl.x, z = sl.z, f = sl.facing, zk = sl.zoneKey;
  cs.remove(sl);
  const k = cs.spawn('bee_keeper', zk, x, z);
  if (!k) return;
  k.facing = k.targetFacing = f;
  const kn = net(k); kn.mi = mi; kn.md = 'wake'; k.mem.mdT = 0; k.mem.init = 1; k.mem.persistent = true;
  playAt('still_crack', k, 1, 16, 0.7); playAt('limb_flies', k, 0.9, 14, 1.3);
  for (const p of playersIn(zk)) if (dist(p, k) < 14) bus.emit('think', p, 'The Still Life the bees were on. It just stood up. It is not wax any more.');
}
// the Still Life part-way there: the growths come through it as the bees keep feeding
(() => {
  const sl: any = getSpecies('still_life');
  if (!sl || sl.__keeperWrap) return;
  sl.__keeperWrap = true;
  const orig = sl.animate;
  sl.animate = (rig: Rig, c: Creature, t: number, dt: number) => {
    orig(rig, c, t, dt);
    const g = netOf(c).bz ?? 0;
    const hr = (rig as any).hr as HumanRig | undefined;
    if (!hr) return;
    const o = OVER.get(hr);
    if (g <= 0) { if (o) { o.mesh.visible = false; o.wings.visible = false; } return; }
    const ov = keeperOverlay(hr);
    ov.mesh.visible = true; ov.wings.visible = g > 0.55;
    poseExtra(ov, { t, growth: Math.min(1, g * 0.85 + 0.1), buzz: 0, sting: 0, quest: 0, chew: 0, still: 1 - g * 0.6, dead: c.dead ? 1 : 0, seed: hashId(c.id, 5) * 50 });
    const lp = localIn(c);
    if (lp && c.visibleToLocal && dist(lp, c) < 9) thinkOnce(lp, 'sl_bees', g < 0.5 ? 'The bees are eating the wax off that one. There is fuzz coming through where they have been.' : 'That Still Life has eyes like a bee\'s coming through its face. And something is moving under its shirt.', 90);
  };
})();

// ------------------------------------------------------------------ stand-alone posing (gallery, video)
export type KeeperPose = 'idle' | 'walk' | 'watch' | 'mimic' | 'inspect' | 'buzz' | 'sting' | 'wake' | 'dead';
/**
 * Animate a keeper rig with no game running (call each frame with a running
 * clock). `growth` < 1 shows a Still Life part-way through turning; `mimic`
 * picks what it copies ('still' | 'crouch' | 'torch' | 'arms' | 'wave');
 * `item` puts an item in its hands for 'inspect'.
 */
export function poseBeeKeeper(rig: Rig, t: number, dt: number, pose: KeeperPose = 'idle', o: { growth?: number; mimic?: string; item?: string; yaw?: number } = {}) {
  const R = rig as KRig;
  holdItem(R, pose === 'inspect' ? (o.item ?? 'flashlight') : '');
  poseK(R, { t, dt, mode: pose, speed: pose === 'walk' ? 0.9 : 0, yaw: o.yaw ?? Math.sin(t * 0.4) * 0.5, mimic: o.mimic ?? 'torch', atk: pose === 'sting' ? 0.5 + 0.5 * Math.sin(t * 3) : 0, wake: pose === 'wake' ? Math.min(1, (t % 6) / 4.5) : 1, flinch: 0, seed: 7, growth: o.growth ?? 1 });
}
(KEEPER as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('') || ['watch', 'walk', 'mimic', 'inspect', 'buzz', 'sting'][Math.floor(t / 4) % 6];
  const u = new URLSearchParams(location.search);
  const R = rig as KRig;
  if (u.get('mi') && R.who !== 'k:' + u.get('mi')) adoptK(R, Number(u.get('mi')));
  poseBeeKeeper(rig, t, 1 / 60, q as KeeperPose, { growth: u.get('growth') !== null ? Number(u.get('growth')) : undefined, mimic: u.get('mimic') ?? undefined });
};
horrify(KEEPER, { twitch: 0.45, snap: 0.3 });
void fakeCreature; void mixHex;
