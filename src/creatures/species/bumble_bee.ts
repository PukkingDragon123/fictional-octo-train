import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { createItem } from '../../items/factory';
import type { Creature } from '../creature';
import { CS, zoneOf, creatureMenu, poke, poked, pulse, stop, findSpot } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, fx, fxPoll } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, flinchOf, hash } from '../kit/humanoids';
import { chain, sac, blade, paintCap } from '../kit/organic';
import { attachFilm, filmPersonalize, uprightDead } from '../kit/gel';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// GIANT BUMBLE BEE — a bumblebee the size of a dog and many times too fat for
// its wings. Ledge-exposed: whatever the Ledge does to bodies, it did it to
// the bee's appetite and not its wings. It hovers a hand's breadth higher than
// it can manage, sagging and climbing, wings a frantic blur no bigger than a
// playing card, and bumps into walls, furniture and people. Every minute or so
// it gives up and sits on the floor, panting through its abdomen, then tries
// again. It does nothing. It cannot sting (the sting is a soft stub). It is
// the Gummy Bear's whole diet.
//   bumble_bee   skinned kit rig (fuzz loft, banded abdomen, pollen baskets) with a
//                translucent wing film; exported buildBee / poseBee for the bear's gut
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
export const BEE_HOVER = 0.62;

function bonesB(v: number): BoneSpec[] {
  const fat = 1 + v * 0.06;
  const b: BoneSpec[] = [
    { name: 'base', parent: '', at: [0, 0, 0] },
    { name: 'thorax', parent: 'base', at: [0, BEE_HOVER, 0.05] },
    { name: 'head', parent: 'thorax', at: [0, 0.005, 0.15], cap: true },
    { name: 'tongue', parent: 'head', at: [0, -0.075, 0.07] },
    { name: 'abd', parent: 'thorax', at: [0, -0.03, -0.11], cap: true },
    { name: 'abd2', parent: 'abd', at: [0, -0.07 * fat, -0.22 * fat] },
    { name: 'sting', parent: 'abd2', at: [0, -0.01, -0.27 * fat] },
  ];
  for (const [s, k] of SIDES) {
    b.push({ name: 'antA' + s, parent: 'head', at: [k * 0.032, 0.07, 0.075] }, { name: 'antB' + s, parent: 'antA' + s, at: [k * 0.022, 0.065, 0.01] });
    b.push({ name: 'mand' + s, parent: 'head', at: [k * 0.028, -0.065, 0.085] });
    b.push({ name: 'wF' + s, parent: 'thorax', at: [k * 0.075, 0.115, 0.035] }, { name: 'wH' + s, parent: 'thorax', at: [k * 0.07, 0.105, -0.035] });
    for (let i = 0; i < 3; i++) {
      const z = 0.065 - i * 0.065;
      b.push(
        { name: `l${i}a${s}`, parent: 'thorax', at: [k * 0.055, -0.1, z], cap: true },
        { name: `l${i}b${s}`, parent: `l${i}a${s}`, at: [k * (0.075 + i * 0.015), -0.035, i === 2 ? -0.045 : i === 0 ? 0.025 : 0] },
        { name: `l${i}c${s}`, parent: `l${i}b${s}`, at: [k * 0.025, -0.095 - i * 0.02, i === 2 ? -0.05 : 0.01] },
      );
    }
  }
  return b;
}
function layoutB(p: Page) { p.reg('ABD', 64, 48); p.reg('THX', 32, 32); p.reg('HEAD', 32, 16); p.reg('EYE', 16, 16); p.reg('LEG', 8, 32); p.reg('POLLEN', 16, 16); p.reg('CAP', 8, 8); p.reg('MOUTH', 8, 8); }

/** fuzz: a jagged per-vertex radius noise that is seamless around the loft */
const fuzz = (amp: number, n: number, rings: number, seed: number) => (a: number, t: number) => {
  const j = Math.round(((a + Math.PI) / (Math.PI * 2)) * n) % n, i = Math.round(t * rings);
  return (hash(j * 7 + i * 131, seed) - 0.5) * amp + (hash(j + 3, i * 17 + seed) < 0.12 ? amp * 0.7 : 0);
};

function buildB(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, v = x.variant, fat = 1 + v * 0.06;
  const T = x.rest('thorax'), H = x.rest('head');
  const wT: Wt = [bi('thorax'), 1], wH: Wt = [bi('head'), 1];
  // ---- abdomen: a huge sagging bag of a body, ringed with fat tergite folds, fuzz everywhere
  const A0 = x.rest('abd'), A1 = x.rest('abd2'), A2 = x.rest('sting');
  const NA = 14, ap: V3[] = [], ar: [number, number][] = [], aw: Wt[] = [];
  for (let i = 0; i <= NA; i++) {
    const t = i / NA;
    const p = t < 0.42 ? A0.map((c, k) => c + (A1[k] - c) * (t / 0.42)) : A1.map((c, k) => c + (A2[k] - c) * ((t - 0.42) / 0.58));
    p[1] -= Math.sin(Math.PI * t) * 0.045 * fat;
    const r = (t < 0.1 ? 0.07 + t * 1.3 : 0.2 + Math.sin(Math.min(1, (t - 0.1) / 0.85) * Math.PI * 0.92) * 0.11) * fat * (t > 0.95 ? 0.4 : 1);
    ap.push(p); ar.push([r, r * 0.97]);
    aw.push(t < 0.42 ? [bi('abd'), 1 - t / 0.42, bi('abd2'), t / 0.42] : t > 0.82 ? [bi('abd2'), (1 - t) / 0.18, bi('sting'), (t - 0.82) / 0.18] : [bi('abd2'), 1]);
  }
  const fA = fuzz(0.16, 18, NA, 3 + v);
  sac(B, R('ABD'), 1, ap, ar, aw, { n: 18, up: [0, 1, 0], bump: (a, t) => fA(a, t) + Math.cos(t * Math.PI * 2 * 5.5) * 0.035 + (Math.abs(a) > 2.2 ? 0.08 : 0) });
  // the sting: a soft, useless stub
  sac(B, R('MOUTH'), 2, [[A2[0], A2[1], A2[2] - 0.01], [A2[0], A2[1] - 0.005, A2[2] - 0.05]], [[0.012, 0.012], [0.002, 0.002]], [[bi('sting'), 1], [bi('sting'), 1]], { n: 6 });
  // ---- thorax: a fuzzy ball with a thick collar
  const fT = fuzz(0.22, 18, 6, 11 + v);
  sac(B, R('THX'), 3, [[T[0], T[1] - 0.005, T[2] - 0.1], [T[0], T[1], T[2] - 0.05], [T[0], T[1] + 0.01, T[2] + 0.02], [T[0], T[1], T[2] + 0.09], [T[0], T[1] - 0.01, T[2] + 0.13]],
    [[0.08, 0.08], [0.135, 0.135], [0.15, 0.155], [0.125, 0.125], [0.06, 0.06]], [wT, wT, wT, wT, wT], { n: 18, bump: fT });
  // ---- head: long-faced, with two great kidney eyes, elbowed antennae, small mandibles, a folded tongue
  const fH = fuzz(0.14, 14, 5, 21 + v);
  sac(B, R('HEAD'), 4, [[H[0], H[1] + 0.01, H[2] - 0.035], [H[0], H[1] + 0.005, H[2] + 0.01], [H[0], H[1] - 0.01, H[2] + 0.06], [H[0], H[1] - 0.035, H[2] + 0.1], [H[0], H[1] - 0.06, H[2] + 0.12]],
    [[0.06, 0.06], [0.085, 0.092], [0.08, 0.095], [0.06, 0.07], [0.028, 0.03]], [wH, wH, wH, wH, wH], { n: 14, bump: fH });
  for (const [s, k] of SIDES) {
    const e: V3 = [H[0] + k * 0.062, H[1] - 0.005, H[2] + 0.055];
    sac(B, R('EYE'), 5, [[e[0] - k * 0.005, e[1], e[2] - 0.05], [e[0], e[1], e[2]], [e[0] - k * 0.008, e[1] - 0.01, e[2] + 0.05]],
      [[0.012, 0.03], [0.026, 0.055], [0.01, 0.03]], [wH, wH, wH], { n: 10, up: [0, 1, 0] });
    chain(B, x, R('LEG'), 6, { bones: ['antA' + s, 'antB' + s], tip: [x.rest('antB' + s)[0] + k * 0.01, x.rest('antB' + s)[1] - 0.02, x.rest('antB' + s)[2] + 0.1], r: [0.008, 0.005], n: 5, rings: 3, knuckle: 0.4 });
    const m = x.rest('mand' + s);
    sac(B, R('MOUTH'), 7, [m, [m[0] - k * 0.012, m[1] - 0.012, m[2] + 0.015], [m[0] - k * 0.026, m[1] - 0.016, m[2] + 0.01]], [[0.009, 0.007], [0.007, 0.005], [0.002, 0.002]], [[bi('mand' + s), 1], [bi('mand' + s), 1], [bi('mand' + s), 1]], { n: 6 });
    // ---- legs: hairy, jointed, the hind pair with a flattened tibia carrying a pollen basket
    for (let i = 0; i < 3; i++) {
      const L = (q: string) => `l${i}${q}${s}`;
      const c = x.rest(L('c'));
      chain(B, x, R('LEG'), 8, { bones: [L('a'), L('b'), L('c')], tip: [c[0] + k * 0.03, c[1] - 0.07, c[2] + (i === 2 ? -0.04 : 0.03)], r: (t) => (i === 2 && t > 0.45 && t < 0.8 ? 0.024 : 0.016 - t * 0.008), flat: i === 2 ? 0.6 : 1,
        n: 6, rings: 3, knuckle: 0.35, bump: (a, t) => (hash(Math.round(a * 3), Math.round(t * 20)) - 0.5) * 0.5 });
      if (i === 2) {
        const b2 = x.rest(L('b'));
        const pm: V3 = [b2[0] + (c[0] - b2[0]) * 0.6 + k * 0.012, b2[1] + (c[1] - b2[1]) * 0.6, b2[2] + (c[2] - b2[2]) * 0.6];
        sac(B, R('POLLEN'), 9, [[pm[0], pm[1] + 0.03, pm[2] + 0.005], pm, [pm[0], pm[1] - 0.03, pm[2] - 0.005]], [[0.016, 0.02], [0.03 + v * 0.004, 0.032], [0.014, 0.018]], [[bi(L('b')), 0.5, bi(L('c')), 0.5], [bi(L('c')), 1], [bi(L('c')), 1]], { n: 8, bump: (a, t) => Math.sin(a * 4 + t * 9) * 0.12 });
      }
    }
  }
  // the folded proboscis under the head
  const tg = x.rest('tongue');
  sac(B, R('MOUTH'), 10, [tg, [tg[0], tg[1] - 0.01, tg[2] - 0.03], [tg[0], tg[1] - 0.015, tg[2] - 0.07]], [[0.008, 0.006], [0.006, 0.005], [0.003, 0.003]], [[bi('tongue'), 1], [bi('tongue'), 1], [bi('tongue'), 1]], { n: 6 });
}
const PAL = { y: 0xd8960e, k: 0x1e1a16, w: 0xf0e6d0, o: 0xe8901c };
function fuzzFill(r: any, R: number[], base: (x: number, y: number) => number, seed: number) {
  r.fill(R, (xx: number, yy: number) => {
    const th = (r.deg(xx) * Math.PI) / 180;
    // short strands: each column of hair darker at the root (top of its cell), lit at the tip
    const cell = (yy + Math.floor(hash(xx, seed) * 4)) % 4;
    return base(xx, yy) + 0.5 * Math.cos(th) - 0.3 + cell * 0.2 + (hash(xx * 3, yy * 5 + seed) - 0.5) * 0.7 + (r.fbm(xx, yy, 3, 2, seed) - 0.5) * 0.6;
  }, undefined, 0.6);
}
function paintB(p: Page, x: BuildCtx) {
  const v = x.variant;
  const Y = makeRamp(mixHex(PAL.y, 0xd89a20, v * 0.3), 7, { hueShift: 0.06, spread: 0.42, satShift: 0.15 }), K = makeRamp(PAL.k, 6, { spread: 0.22 }), Wh = makeRamp(mixHex(PAL.w, 0xe8d0a0, v * 0.3), 6, { spread: 0.35 });
  // abdomen bands, front (top rows) to tail: yellow, black, a thin yellow, black, white tail
  const ab = p.R('ABD');
  const band = (f: number) => (f < 0.17 ? 'y' : f < 0.4 ? 'k' : f < 0.52 ? 'y' : f < 0.7 ? 'k' : 'w');
  // band by band, with ragged hairy borders
  for (let yy = 0; yy < ab.h; yy++) for (let xx = 0; xx < ab.w; xx++) {
    const f = (yy + (hash(xx * 7, yy) - 0.5) * 3.5) / ab.h;
    const key = band(Math.max(0, Math.min(0.999, f)));
    const RR = key === 'y' ? Y : key === 'k' ? K : Wh;
    const th = (ab.deg(xx) * Math.PI) / 180;
    const cell = (yy + Math.floor(hash(xx, 9) * 4)) % 4;
    ab.put(xx, yy, RR, RR.length * 0.4 + 0.4 * Math.cos(th) - 0.2 + cell * 0.2 + (hash(xx * 3, yy * 5) - 0.5) * 0.7 + (ab.fbm(xx, yy, 3, 2, 4) - 0.5) * 0.6 - (Math.abs(th) > 2.3 ? 0.8 : 0), 0.45);
  }
  // fat folds: a darker crease line between segments, and a few bald, shiny stretch patches
  for (let s = 1; s < 6; s++) { const yy = Math.round((s / 5.5) * ab.h); for (let xx = 0; xx < ab.w; xx++) if (hash(xx, s) < 0.7) ab.blend(xx, yy, 0x0c0a08, 0.45); }
  for (let i = 0; i < 4 + v; i++) ab.glow(hash(i, 41) * ab.w, ab.h * (0.3 + hash(i, 43) * 0.5), 3 + hash(i, 2) * 3, 2, 0x3a2a1a, 0.5);
  // thorax: a yellow collar, a black saddle between the wings, yellow again at the back
  const th = p.R('THX');
  for (let yy = 0; yy < th.h; yy++) for (let xx = 0; xx < th.w; xx++) {
    const f = (yy + (hash(xx * 5, yy) - 0.5) * 3) / th.h;
    const top = Math.abs(th.deg(xx)) < 70;
    const key = f > 0.62 ? 'y' : f > 0.34 && top ? 'k' : f < 0.22 ? 'y' : top ? 'k' : 'y';
    const RR = key === 'y' ? Y : K;
    const a = (th.deg(xx) * Math.PI) / 180;
    th.put(xx, yy, RR, RR.length * 0.4 + 0.4 * Math.cos(a) - 0.2 + ((yy + Math.floor(hash(xx, 4) * 3)) % 3) * 0.22 + (hash(xx * 3, yy * 7) - 0.5) * 0.8, 0.45);
  }
  // head: black fuzz with a pale tuft on the crown
  const hd = p.R('HEAD');
  fuzzFill(hd, K, () => K.length * 0.5, 7);
  for (let i = 0; i < 30; i++) hd.blend(hd.w / 2 + (hash(i, 1) - 0.5) * 10, hash(i, 2) * hd.h * 0.4, PAL.y, 0.6);
  // compound eyes: glossy black with a hex shimmer and a wet highlight band
  const ey = p.R('EYE');
  ey.fill(makeRamp(0x14161c, 5, { spread: 0.6 }), (xx, yy) => 1.4 + ((xx + (yy & 1)) % 2) * 0.4 + (Math.abs(ey.deg(xx)) < 40 && yy > 3 && yy < 8 ? 2.4 : 0) + (hash(xx, yy) - 0.5) * 0.6, undefined, 0.4);
  ey.set(6, 4, 0xffffff); ey.set(7, 4, 0xc8d0e0); ey.set(9, 5, 0x8890a8);
  // legs: black-brown, bristly
  p.R('LEG').fill(makeRamp(0x2a2018, 5), (xx, yy) => 2 + (yy % 3 === 0 ? -0.8 : 0) + (hash(xx, yy) - 0.5) * 1.4 + Math.cos((p.R('LEG').deg(xx) * Math.PI) / 180) * 0.6);
  // pollen: packed orange crumbs
  const po = p.R('POLLEN');
  po.fill(makeRamp(PAL.o, 6, { hueShift: 0.06 }), (xx, yy) => 2.5 + (hash(xx * 3, yy * 3) - 0.5) * 2.4 + (po.fbm(xx, yy, 2, 2, 8) - 0.5) * 1.5);
  p.R('MOUTH').fill(makeRamp(0x3a2414, 4), (xx, yy) => 1.5 + (hash(xx, yy) - 0.5));
  paintCap(p.R('CAP'), PAL.y, 0xe8d0a0, 0x8a5a20);
}
export const BEE_KIT: KitDef = { key: 'bumble_bee', variants: 3, W: 128, H: 128, bones: bonesB, layout: layoutB, build: buildB, paint: paintB, sphere: [0, 0.55, -0.1, 0.6],
  decorate: (rig) => { attachFilm(rig, WING_KIT, 0, { opacity: 0.62, edge: 0.8, spec: 1.2, rim: 0.3, doubleSide: true }); } };

// ---- the wings: four small smoky membranes on the same skeleton, drawn as a translucent film
function layoutW(p: Page) { p.reg('WING', 32, 16); p.reg('CAP', 8, 8); }
function buildW(B: SkinB, x: BuildCtx) {
  for (const [s, k] of SIDES) for (const [w, L, Wd] of [['wF', 0.2, 0.06], ['wH', 0.13, 0.04]] as const) {
    const r = x.rest(w + s), id = x.bi(w + s);
    const pts: V3[] = [0, 0.3, 0.6, 0.85, 1].map((t) => [r[0] + k * L * t, r[1] + 0.012 * Math.sin(t * Math.PI), r[2] - L * 0.32 * t]);
    const wd = [Wd * 0.25, Wd * 0.8, Wd, Wd * 0.8, Wd * 0.1];
    blade(B, x.R('WING'), pts, wd, [0, 0, -1], pts.map(() => [id, 1]), { offset: -0.35, edge: 0.15, seed: k + 3 });
  }
}
function paintW(p: Page) {
  const r = p.R('WING');
  r.fill(makeRamp(0xc8c0b0, 5, { spread: 0.4 }), (xx, yy) => 2.6 + (r.fbm(xx, yy, 2, 2, 3) - 0.5) * 1.2 - (yy / r.h) * 0.8);
  // veins: dark lines branching out from the root
  for (let i = 0; i < 5; i++) r.line(0, r.h * (0.2 + i * 0.15), r.w, r.h * (0.1 + i * 0.2), 0x3a3020, 0.7);
  for (let i = 0; i < 4; i++) r.line(r.w * (0.3 + i * 0.15), 0, r.w * (0.35 + i * 0.15), r.h, 0x4a4030, 0.5);
  r.hline(0, r.w, 0, 0x2a2418, 0.9);
  paintCap(p.R('CAP'), 0xc8c0b0, 0xa8a090, 0x605848);
}
const WING_KIT: KitDef = { key: 'bumble_bee_wing', variants: 1, W: 64, H: 32, bones: () => bonesB(0), layout: layoutW, build: buildW, paint: paintW, sphere: [0, 0.7, 0, 0.4] };

/** a bee rig, unwrapped (the Gummy Bear carries one in its gut) */
export function buildBee(variant = 0): KitRig { return buildKitRig(BEE_KIT, variant, BEE_HOVER + 0.05); }

// ------------------------------------------------------------------ animation
export interface BeeDrive { t: number; dt: number; fly: number; panic: number; bonk: number; bonkSide: number; dead: number; seed: number; flinch: number; speed: number; still?: number }
/**
 * Pose a bee rig: `fly` 0 sits it on the floor (panting) and 1 holds it in its
 * labouring hover; `bonk` is a fresh collision (squash, recoil, a dizzy roll);
 * `still` (0..1) freezes wings and legs (a bee being digested only twitches).
 */
export function poseBee(rig: KitRig, d: BeeDrive) {
  const P = rig.parts, t = d.t, s7 = d.seed * 7, fly = d.fly * (1 - d.dead), still = d.still ?? 0, live = 1 - still;
  // the hover: never quite high enough; it sags, panics, claws back up
  const sag = Math.pow(Math.max(0, Math.sin(t * 0.55 + s7)), 8) * 0.14;
  const bob = (Math.sin(t * 2.7 + s7) * 0.045 + Math.sin(t * 7.1 + s7 * 2) * 0.012) * live;
  const lift = -0.28 * (1 - fly) + fly * (bob - sag);
  const base = P.base;
  base.rotation.set(0, 0, 0); base.position.set(0, 0, 0);
  const th = P.thorax;
  th.position.set(Math.sin(t * 1.3 + s7) * 0.03 * fly + d.bonkSide * d.bonk * 0.05, (th.userData.p0?.y ?? BEE_HOVER) + lift, (th.userData.p0?.z ?? 0.05) - d.bonk * 0.12);
  // nose up, the abdomen hanging like a sack of sand; it wallows from side to side; a collision throws it
  th.rotation.set(-0.2 * fly - sag * 1.6 - d.panic * 0.12 + Math.sin(t * 1.9 + s7) * 0.05 * fly + d.bonk * 0.35,
    Math.sin(t * 1.1 + s7) * 0.08 * fly + d.bonkSide * d.bonk * 0.4,
    Math.sin(t * 1.7 + s7 * 3) * 0.12 * fly + Math.sin(t * 13) * d.bonk * 0.3 + d.bonkSide * d.bonk * 0.25);
  // squash on impact, a fat jiggle after
  const jig = Math.sin(t * 26) * d.bonk;
  th.scale.set(1 + 0.12 * d.bonk + jig * 0.05, 1 - 0.14 * d.bonk - jig * 0.05, 1 + 0.08 * d.bonk);
  // abdomen: hangs, pumps (hard while it sits), the sting stub flicks
  const pant = (1 - fly) * 1 + d.panic * 0.6 + 0.35;
  const pump = Math.sin(t * (3 + pant * 3.5) + s7) * live;
  P.abd.rotation.set(-0.12 - 0.12 * fly - sag * 0.8 + Math.sin(t * 1.5) * 0.04 + d.bonk * 0.2, Math.sin(t * 0.9 + s7) * 0.06, Math.sin(t * 1.3) * 0.05 * fly);
  P.abd2.scale.set(1 + pump * 0.03 * pant, 1 + pump * 0.05 * pant, 1 - pump * 0.015);
  P.sting.rotation.set(Math.sin(t * 5 + s7) * 0.25 * live, 0, 0);
  // wings: a frantic blur in flight (far too small to carry this), folded flat over the back when it sits
  for (const [s, k] of SIDES) {
    for (const [w, ph, amp] of [['wF', 0, 1.0], ['wH', 0.6, 0.85]] as const) {
      const o = P[w + s]; if (!o) continue;
      const beat = Math.sin(t * (92 + d.panic * 30) + ph + (k > 0 ? 0 : 0.2)) * amp * live;
      const flyW = Math.max(fly, d.panic * 0.5, still ? 0 : (1 - fly) * (Math.sin(t * 0.8 + s7) > 0.85 ? 1 : 0));
      o.rotation.set(beat * 0.25 * flyW, k * (0.15 + (1 - flyW) * 1.15), k * (0.25 * flyW + beat * 0.9 * flyW + (1 - flyW) * 0.12));
    }
    // legs: dangle and paddle in the air, splay and brace on the floor, curl when dead
    for (let i = 0; i < 3; i++) {
      const a = P[`l${i}a${s}`], b = P[`l${i}b${s}`], c = P[`l${i}c${s}`]; if (!a) continue;
      const pad = Math.sin(t * 3.2 + i * 1.7 + k + s7) * live;
      const curl = d.dead;
      a.rotation.set((i - 1) * 0.25 + pad * 0.15 * fly - curl * 0.5, 0, k * (-0.45 * fly + 0.25 * (1 - fly) + curl * 0.9 + pad * 0.08));
      b.rotation.set(pad * 0.12 * fly, 0, k * (0.5 * fly - 0.35 * (1 - fly) + curl * 1.1));
      c?.rotation.set(0.2 * fly + pad * 0.1, 0, k * (0.3 * fly - 0.25 * (1 - fly) + curl * 0.8));
    }
    // antennae: questing, drooping when it is spent
    P['antA' + s]?.rotation.set(-0.2 + Math.sin(t * 2.1 + k + s7) * 0.25 * live - (1 - fly) * 0.2, k * Math.sin(t * 1.3 + k) * 0.2 * live, k * 0.1);
    P['antB' + s]?.rotation.set(0.9 + Math.sin(t * 2.9 + k * 2) * 0.3 * live, 0, 0);
    P['mand' + s]?.rotation.set(0, k * Math.max(0, Math.sin(t * 6 + k)) * 0.3 * (1 - fly) * live, 0);
  }
  P.head.rotation.set(0.1 * fly + Math.sin(t * 1.7 + s7) * 0.06 * live, Math.sin(t * 0.8 + s7) * 0.15 * live, d.bonkSide * d.bonk * 0.3);
  // sitting, it licks the floor now and then
  P.tongue.rotation.set(Math.max(0, Math.sin(t * 0.9 + s7)) * 0.9 * (1 - fly) * live, 0, 0);
  // dead: rolls onto its back on the floor, legs curled (the kit's base pivots about the body)
  if (d.dead > 0) {
    const k = d.dead, a = Math.PI * k, pv = 0.5;
    base.rotation.z = a;
    base.position.set(pv * Math.sin(a), pv - pv * Math.cos(a) - 0.06 * k, 0);
  }
  if (d.flinch > 0) th.position.x += Math.sin(t * 80) * 0.02 * d.flinch;
}

function animateBee(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); filmPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = rig.root.userData as Record<string, number>, seed = hashId(c.id, 4);
  const sm = (k: string, to: number, rate: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
  const f = fxPoll(rig, c);
  if (f?.key === 'bonk') { ud.bk = 1; ud.bs = (f.a?.s ?? (Math.random() < 0.5 ? -1 : 1)); }
  ud.bk = Math.max(0, (ud.bk ?? 0) - dt * 1.6);
  const fly = sm('fly', n.md === 'rest' ? 0 : 1, n.md === 'rest' ? 1.4 : n.md === 'up' ? 0.7 : 2);
  const panic = sm('pan', n.md === 'panic' ? 1 : 0, 3);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 2.2) : 0;
  poseBee(K, { t, dt, fly, panic, bonk: ud.bk, bonkSide: ud.bs ?? 1, dead: ud.dk * ud.dk, seed, flinch: flinchOf(c), speed: c.speed });
  uprightDead(K, c);
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && dist(p, c) < 5) thinkOnce(p, 'bumble_bee', [
    'A bumblebee the size of a dog. Its wings are the size of my hand. How is it up there?',
    'It just flew into the wall. It is trying again.',
    'It is so fat it has to sit down. It is panting.',
  ][Math.floor(t * 0.15) % 3], 100);
}

// ------------------------------------------------------------------ host brain: labouring drift, sitting down, bumping into things
function bearNear(c: Creature, r: number): Creature | null {
  let best: Creature | null = null, bd = r;
  for (const o of CS().creatures.values()) {
    if (o.zoneKey !== c.zoneKey || o.dead || o.sp.key !== 'gummy_bear') continue;
    const d = dist(o, c);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
function thinkBee(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  if (!m.init) { m.init = 1; m.restAt = G.time + rng.float(6, 30); n.md = ''; }
  // collisions: it was moving and it went nowhere (applyMove ran with last frame's speed)
  const moved = Math.hypot(c.x - (m.px ?? c.x), c.z - (m.pz ?? c.z));
  const want = (m.lastSpd ?? 0) * dt;
  m.px = c.x; m.pz = c.z; m.lastSpd = c.speed;
  if (n.md !== 'rest' && want > 0.004 && moved < want * 0.3 && G.time > (m.bonkAt ?? 0)) {
    m.bonkAt = G.time + 1.2; m.daze = 0.9;
    fx(c, 'bonk', { s: rng.chance(0.5) ? 1 : -1 });
    playAt('bh_plop', c, 0.7, 10, 0.65 + rng.float(0, 0.2));
    c.goal = null;
  }
  // bumped by a running survivor: the same
  for (const p of cs.playersInZone(c.zoneKey)) if (dist(p, c) < c.radius + 0.45 && (p.speed ?? 0) > 1.5 && G.time > (m.bonkAt ?? 0)) {
    m.bonkAt = G.time + 1.2; m.daze = 0.7; fx(c, 'bonk', { s: rng.chance(0.5) ? 1 : -1 }); playAt('bh_plop', c, 0.7, 10, 0.7);
    if (p.isLocal) bus.emit('think', p, ['I walked into it. It is like walking into a warm cushion.', 'It bounced off me. It did not even look annoyed.'][Math.floor(Math.random() * 2)]);
  }
  if (ev.hurt > 0 || poked(c, 'pluck')) m.panicT = 5;
  // it notices a stalking bear late (three metres), a coiling or charging one from further off
  const bear = bearNear(c, 7), bmd = bear ? netOf(bear).md : '';
  if (bear && ((bmd === 'stalk' && dist(bear, c) < 3.2) || bmd === 'coil' || bmd === 'lunge' || bmd === 'chase')) m.panicT = Math.max(m.panicT ?? 0, 3);
  m.panicT = Math.max(0, (m.panicT ?? 0) - dt);
  m.daze = Math.max(0, (m.daze ?? 0) - dt);
  if (m.daze > 0) { stop(c); return true; }
  // panic: away from whatever, at a wheezing, useless speed
  if (m.panicT > 0) {
    if (n.md === 'rest') { n.md = 'up'; m.upT = 0; }
    if (n.md !== 'up') n.md = 'panic';
    c.setState('flee');
    const fx0 = bear ? bear.x : c.x + Math.cos(c.facing), fz0 = bear ? bear.z : c.z + Math.sin(c.facing);
    if (!c.goal || c.stateT > 3) { c.goal = cs.fleeSpot(c, z, fx0, fz0); c.stateT = 0; }
    if (n.md === 'up') { m.upT = (m.upT ?? 0) + dt; if (m.upT > 1.2) n.md = 'panic'; stop(c); return true; }
    cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.6);
    return true;
  }
  if (n.md === 'panic') n.md = '';
  // sitting on the floor, spent
  if (n.md === 'rest') {
    stop(c); c.setState('idle');
    if (G.time > (m.upAt ?? 0)) { n.md = 'up'; m.upT = 0; playAt('limb_flies', c, 0.4, 9, 1.3); }
    return true;
  }
  // taking off: wings flat out, it rises... or it does not
  if (n.md === 'up') {
    stop(c);
    m.upT = (m.upT ?? 0) + dt;
    if (m.upT > 1.6) {
      if (rng.chance(0.3)) { n.md = 'rest'; m.upAt = G.time + rng.float(2, 5); fx(c, 'bonk', { s: 1 }); playAt('bh_plop', c, 0.6, 8, 0.55); }
      else { n.md = ''; m.restAt = G.time + rng.float(20, 45); }
    }
    return true;
  }
  if (G.time > (m.restAt ?? 0)) { n.md = 'rest'; m.upAt = G.time + rng.float(6, 16); stop(c); return true; }
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.5) || c.stateT > 18) {
    c.goal = findSpot(c, { rMin: 2, rMax: 8 }) ?? cs.wanderSpot(c, z, 8);
    c.stateT = 0;
  }
  return true;
}

const BEE = def({
  key: 'bumble_bee', name: 'Giant Bumble Bee', code: 'LG-02 // FAUNA, APID', temperament: 'peaceful', threat: 0,
  rule: { name: 'TOO FAT TO FLY', text: 'Harmless. It cannot sting and it can barely fly: it hovers, sags, bumps into walls and sits down to pant. Where there are bees, a Gummy Bear is hunting them. Stay close to the bees and the bear will choose them over you.', tell: 'A bee the size of a dog, wings like playing cards. It just flew into the wall.' },
  hp: 14, walk: 0.38, run: 0.95, turn: 1.6, radius: 0.32, height: 0.95, sight: 6, fov: 2.2, hearing: 0.6,
  zones: ['ledge', 'fields', 'meadow'], weight: 1, group: [1, 3], maxPerZone: 8, diet: 'none',
  flags: { flying: true },
  meat: [['small_meat_raw', 1]],
  sounds: { loop: 'limb_flies', hurt: 'cower_squeak', death: 'cower_die' } as any,
  scan: { cls: 'Fauna / apid, flightless in all but intent', notes: ['A bumblebee the size of a dog. The abdomen alone is a beach ball of fuzz and fat.', 'The wings are no bigger than playing cards. It hovers anyway, barely, and keeps sagging.', 'It bumps into things and sits down to pant. The sting is a soft stub.', 'Its fuzz and the wax flaking off its belly can be harvested. It does not mind much.'] },
  gore: { blood: 'pale', tint: 0xf0d070, flesh: 0xe8b62a, sever: ['head', 'abd', 'l0aL', 'l0aR', 'l1aL', 'l1aR', 'l2aL', 'l2aR'], head: 'head' },
  build: () => buildBee(0), animate: animateBee, think: thinkBee,
});
(BEE as any).handlesSevered = true;
creatureMenu('bumble_bee', (p, c, opts) => {
  for (const [label, item, verb, lines] of [
    ['Pluck fuzz', 'bee_fuzz', 'Pluck', ['A handful of fuzz. It buzzed at me, once, then forgot about it.', 'Soft as a cat. Warmer.']],
    ['Scrape honey wax', 'honey_wax', 'Scrape', ['The wax flakes off its belly in warm sheets. It smells of honey and old candles.', 'It sat still for that. I think it liked it.']],
  ] as const) {
    opts.push({
      label, action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, verb, 2.2, 'pickup', () => {
        if (!CS().creatures.has(c.id) || c.dead) return;
        const key = item + ':' + c.id, now = G.time;
        poke(p, c, 'pluck');
        if (((p as any)[key] ?? -1e9) > now - 150) { bus.emit('think', p, 'Nothing left on it to take. Let it grow back.'); return; }
        (p as any)[key] = now;
        p.inv.add(createItem(item));
        bus.emit('inventoryChanged', p);
        bus.emit('think', p, lines[Math.floor(Math.random() * lines.length)]);
      }), 0.9, false),
    });
  }
});
BEE.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || ['hover', 'rest', 'bonk', 'panic'][Math.floor(t / 4) % 4];
  const K = rig as KitRig, ud = rig.root.userData as Record<string, number>;
  if (q === 'bonk' && Math.floor(t * 0.7) !== ud.lb) { ud.lb = Math.floor(t * 0.7); ud.gbk = 1; }
  ud.gbk = Math.max(0, (ud.gbk ?? 0) - 1 / 60 * 1.6);
  kitSync(K);
  poseBee(K, { t, dt: 1 / 60, fly: q === 'rest' || q === 'dead' ? 0 : 1, panic: q === 'panic' ? 1 : 0, bonk: q === 'bonk' ? ud.gbk : 0, bonkSide: 1, dead: q === 'dead' ? 1 : 0, seed: 0.3, flinch: 0, speed: 0 });
};
horrify(BEE, { twitch: 0.15, snap: 0.08, breathe: 0.01, parts: /ant|mand|tongue/ });
void THREE;
