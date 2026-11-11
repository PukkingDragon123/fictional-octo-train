import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, faceTo, onKilled, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, heldFlame, live } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash } from '../kit/humanoids';
import { chain, sac, paintCap, paintSkin } from '../kit/organic';
import { mkBones, skBlob, paintMycelium, paintCapTop, sporeCloud } from '../kit/fungal';
import { larderNear, nibble } from '../../world/remains';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE SPORE RAT — a big sewer rat that a Fungus Mind has grown through. White
// mycelium mats its fur in patches and has eaten the left eye out from behind,
// and a cluster of fruiting bodies stands up out of its back like a crest,
// nodding as it runs. It still eats and breeds like a rat, but it lives on the
// mind's network and goes where the mind sends it: packs of four or five hatch
// out of the nodes when the network feels a unit, run it down and bite at its
// ankles, darting in and out. A spore rat that dies bursts: the caps on its
// back break open in a cloud that blurs the mind and fills the lungs.
//   spore_rat   skinned kit rig: rat body, head, ears, four legs, ringed tail,
//               four cap stalks on the back, a cap out of the eye socket, felt patches
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildSporeRat(variant?)                                -> KitRig
//   poseSporeRat(rig, t, dt, pose, { speed?, variant? })
//     pose: 'idle' | 'sniff' | 'walk' | 'run' | 'bite' | 'retreat' | 'eat' | 'burst' | 'dead'
// =====================================================================================

const S = 1.35;
const sc = (p: V3): V3 => [p[0] * S, p[1] * S, p[2] * S];
const SIDES = [['L', 1], ['R', -1]] as const;
const NT = 6;
const STK: [V3, number][] = [[[0.022, 0.158, -0.06], 0.08], [[-0.024, 0.162, 0.0], 0.1], [[0.012, 0.155, 0.06], 0.06], [[-0.018, 0.148, -0.12], 0.065], [[0.004, 0.16, -0.025], 0.12], [[0.03, 0.15, 0.025], 0.05]];

function bonesR() {
  const A: [string, string, V3, boolean?][] = [
    ['base', '', [0, 0, 0]], ['pelvis', 'base', sc([0, 0.1, -0.1]), true], ['spine', 'pelvis', sc([0, 0.115, 0])], ['chest', 'spine', sc([0, 0.108, 0.08]), true],
    ['neck', 'chest', sc([0, 0.105, 0.135])], ['head', 'neck', sc([0, 0.105, 0.17]), true], ['jaw', 'head', sc([0, 0.082, 0.2])],
  ];
  for (const [s, k] of SIDES) A.push(['ear' + s, 'head', sc([k * 0.03, 0.14, 0.168])]);
  A.push(['ec', 'head', sc([0.026, 0.13, 0.21]), true]);
  for (const [s, k] of SIDES) {
    A.push(['fs' + s, 'chest', sc([k * 0.038, 0.09, 0.09]), true], ['fe' + s, 'fs' + s, sc([k * 0.042, 0.045, 0.078])], ['fp' + s, 'fe' + s, sc([k * 0.043, 0.012, 0.105])]);
    A.push(['hh' + s, 'pelvis', sc([k * 0.045, 0.095, -0.1]), true], ['hk' + s, 'hh' + s, sc([k * 0.05, 0.058, -0.06])], ['ha' + s, 'hk' + s, sc([k * 0.05, 0.028, -0.125])], ['hp' + s, 'ha' + s, sc([k * 0.05, 0.008, -0.085])]);
  }
  for (let i = 0; i < NT; i++) A.push(['t' + i, i ? 't' + (i - 1) : 'pelvis', sc([0, Math.max(0.012, 0.085 - i * 0.016), -0.17 - i * 0.05]), i === 1]);
  STK.forEach(([p, l], i) => {
    const lean = (i % 2 ? -1 : 1) * 0.15;
    const par = p[2] > 0.03 ? 'chest' : p[2] < -0.08 ? 'pelvis' : 'spine';
    A.push(['s' + i + 'a', par, sc(p), true], ['s' + i + 'b', 's' + i + 'a', sc([p[0] + lean * l * 0.5, p[1] + l * 0.5, p[2] - 0.01])], ['s' + i + 'c', 's' + i + 'b', sc([p[0] + lean * l, p[1] + l, p[2] - 0.02]), true]);
  });
  return mkBones(A);
}
function layoutR(p: Page) { p.reg('FUR', 64, 48); p.reg('HEAD', 32, 24); p.reg('SKIN', 16, 32); p.reg('LEG', 16, 16); p.reg('CAPT', 24, 16); p.reg('STALK', 8, 16); p.reg('MYC', 24, 16); p.reg('EYE', 8, 8); p.reg('CAP', 8, 8); }

const BODY: [number, number, number, number][] = [
  // z, centre y, half width, half height (unscaled)
  [-0.19, 0.085, 0.02, 0.02], [-0.16, 0.09, 0.05, 0.048], [-0.11, 0.1, 0.064, 0.06], [-0.05, 0.108, 0.062, 0.062], [0.01, 0.108, 0.056, 0.058], [0.07, 0.104, 0.048, 0.052], [0.12, 0.104, 0.038, 0.042], [0.15, 0.105, 0.034, 0.038],
];
function buildR(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, rest = x.rest, v = x.variant;
  const sp: [string, number][] = [['pelvis', -0.1], ['spine', 0], ['chest', 0.08], ['neck', 0.14]];
  const wz = (z: number): Wt => { const c = sp.map(([n, bz]) => [bi(n), Math.exp(-((z - bz * S) ** 2) / (2 * (0.05 * S) ** 2))] as [number, number]).sort((a, b) => b[1] - a[1]).slice(0, 2); const tt = c[0][1] + c[1][1] || 1; return [c[0][0], c[0][1] / tt, c[1][0], c[1][1] / tt]; };
  // the body: a pear of matted fur, lumped where the mycelium has pushed up under the skin
  sac(B, R('FUR'), 1, BODY.map(([z, y]) => sc([0, y, z])), BODY.map(([, , w, h]) => [w * S, h * S] as [number, number]), BODY.map(([z]) => wz(z * S)), {
    n: 14, start: true, end: false,
    bump: (a, t) => 0.14 * Math.max(0, Math.sin(a * 3 + t * 9 + v)) * Math.max(0, Math.sin(t * 13 + a * 2)) + (hash(Math.round(a * 4), Math.round(t * 14) + v) - 0.5) * 0.12 + (Math.abs(a) > 2.4 ? 0.06 * Math.sin(Math.PI * t) : 0),
  });
  // the head: a wedge to the nose, cheeks, the lower jaw
  const hd = bi('head'), nk = bi('neck');
  sac(B, R('HEAD'), 2, [sc([0, 0.105, 0.14]), sc([0, 0.108, 0.175]), sc([0, 0.1, 0.215]), sc([0, 0.09, 0.25]), sc([0, 0.084, 0.268])], [[0.034 * S, 0.036 * S], [0.034 * S, 0.034 * S], [0.024 * S, 0.024 * S], [0.013 * S, 0.014 * S], [0.006 * S, 0.006 * S]],
    [[nk, 0.6, hd, 0.4], [hd, 1], [hd, 1], [hd, 1], [hd, 1]], { n: 10, start: false, end: true, bump: (a, t) => (Math.abs(a) > 1.2 && Math.abs(a) < 2 && t > 0.2 && t < 0.6 ? 0.12 : 0) });
  sac(B, R('SKIN'), 3, [sc([0, 0.078, 0.19]), sc([0, 0.074, 0.23]), sc([0, 0.076, 0.25])], [[0.016 * S, 0.008 * S], [0.01 * S, 0.006 * S], [0.004 * S, 0.004 * S]], [[bi('jaw'), 1], [bi('jaw'), 1], [bi('jaw'), 1]], { n: 6 });
  // the right eye: a black bead; the left is a cap
  skBlob(B, R('EYE'), 4, sc([-0.024, 0.12, 0.208]), [0.009 * S, 0.008 * S, 0.009 * S], { n: 6, rings: 4, w: [hd, 1] });
  for (const [s, k] of SIDES) skBlob(B, R('SKIN'), 5 + (k > 0 ? 0 : 1), rest('ear' + s), [0.018 * S, 0.02 * S, 0.006 * S], { n: 8, rings: 4, w: [bi('ear' + s), 1], bump: (d) => (d[2] > 0.5 ? -0.5 : 0) });
  // legs: thin and pink at the paw, fur to the knee
  for (const [s] of SIDES) {
    chain(B, x, R('LEG'), 10 + (s === 'L' ? 0 : 1), { bones: ['fs' + s, 'fe' + s, 'fp' + s], tipLen: 0.022 * S, r: [0.014 * S, 0.005 * S], n: 5, rings: 2 });
    chain(B, x, R('LEG'), 12 + (s === 'L' ? 0 : 1), { bones: ['hh' + s, 'hk' + s, 'ha' + s, 'hp' + s], tipLen: 0.028 * S, r: (t) => (0.026 * (1 - t) + 0.005) * S, n: 5, rings: 2 });
  }
  // the tail: long, ringed, naked
  chain(B, x, R('SKIN'), 14, { bones: Array.from({ length: NT }, (_, i) => 't' + i), tipLen: 0.05 * S, r: (t) => (0.013 * (1 - t) + 0.002) * S, n: 5, rings: 2, bump: (_, t) => 0.12 * Math.max(0, Math.sin(t * 70)) });
  // the crest of fruiting bodies, and the cap out of the eye
  STK.forEach((_, i) => {
    chain(B, x, R('STALK'), 20 + i, { bones: ['s' + i + 'a', 's' + i + 'b'], tip: rest('s' + i + 'c'), r: [0.013 * S, 0.009 * S], n: 5, rings: 2, bump: (_, t) => 0.2 * Math.sin(t * 9 + i) });
    const cp = rest('s' + i + 'c'), big = i === 1 || i === 4;
    skBlob(B, R('CAPT'), 30 + i, [cp[0], cp[1] - 0.006, cp[2]], big ? [0.036 * S, 0.02 * S, 0.034 * S] : [0.026 * S, 0.015 * S, 0.025 * S], { n: 10, rings: 5, vr: [0.38, 1], w: [bi('s' + i + 'c'), 1], bump: (d) => 0.1 * Math.sin(Math.atan2(d[2], d[0]) * 7 + i) + (d[1] < 0.4 ? 0.12 : 0) });
  });
  const ec = rest('ec');
  skBlob(B, R('CAPT'), 40, [ec[0] + 0.006, ec[1] + 0.006, ec[2]], [0.02 * S, 0.016 * S, 0.02 * S], { n: 8, rings: 5, vr: [0.35, 1], w: [bi('ec'), 1] });
  chain(B, x, R('STALK'), 41, { bones: ['head', 'ec'], tip: [ec[0] + 0.006, ec[1] + 0.006, ec[2]], r: [0.007 * S, 0.006 * S], n: 4, rings: 2 });
  // felt patches bursting through the fur
  for (let i = 0; i < 5; i++) {
    const z = (-0.15 + i * 0.065) * S, side = i % 2 ? 1 : -1;
    skBlob(B, R('MYC'), 50 + i, [side * 0.045 * S, (0.11 + (i % 3) * 0.012) * S, z], [0.026 * S, 0.014 * S, 0.03 * S], { n: 7, rings: 4, w: wz(z), bump: (d) => 0.25 * Math.sin(d[0] * 9 + d[2] * 7 + i) });
  }
}
function paintR(p: Page, x: BuildCtx) {
  const v = x.variant;
  const FUR = makeRamp(mixHex(0x4a4038, 0x3e3a36, v * 0.4), 7, { spread: 0.6 });
  const f = p.R('FUR');
  f.fill(FUR, (xx, yy) => 2 + Math.cos((f.deg(xx) * Math.PI) / 180) * 1.2 + ((xx + (yy >> 1)) % 3 === 0 ? -0.8 : 0.2) + (f.fbm(xx, yy, 4, 2, 7 + v) - 0.5) * 1.8, undefined, 0.5);
  // mycelium eating through in patches, pink bald skin round them
  for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) {
    const n = f.fbm(xx, yy, 3, 3, 31 + v);
    if (n > 0.66) f.set(xx, yy, n > 0.74 ? (hash(xx, yy) < 0.5 ? 0xf0ecf0 : 0xd8d2dc) : 0xb08890);
  }
  for (let i = 0; i < 40; i++) f.crack(hash(i, 3) * f.w, hash(i + 5, 3) * f.h, 5, hash(i, 9) * 360, 0xe8e4ea, 3 + i, 0.5, 0.1);
  const h = p.R('HEAD');
  h.fill(FUR, (xx, yy) => 2.2 + Math.cos((h.deg(xx) * Math.PI) / 180) - (yy / h.h) * 0.8 + (hash(xx, yy) - 0.5) * 0.8, undefined, 0.5);
  for (let yy = Math.floor(h.h * 0.7); yy < h.h; yy++) for (let xx = 0; xx < h.w; xx++) h.blend(xx, yy, 0xc88a90, 0.6);
  h.ellipse(h.X(0), h.h - 1.5, 2, 1.5, 0x3a2024, 1);
  paintSkin(p.R('SKIN'), makeRamp(0xc8969a, 6), { seed: 4, veins: 2, mottle: 1, glint: 3 });
  const sk = p.R('SKIN');
  for (let yy = 0; yy < sk.h; yy += 2) for (let xx = 0; xx < sk.w; xx++) sk.blend(xx, yy, 0x8a5a60, 0.3);
  const l = p.R('LEG');
  l.fill(FUR, (xx, yy) => 1.8 + Math.cos((l.deg(xx) * Math.PI) / 180) * 0.8, undefined, 0.5);
  for (let yy = Math.floor(l.h * 0.6); yy < l.h; yy++) for (let xx = 0; xx < l.w; xx++) l.set(xx, yy, hash(xx, yy) < 0.5 ? 0xd0a0a4 : 0xb88890);
  paintCapTop(p.R('CAPT'), makeRamp(mixHex(0xc89a50, 0xb07a40, v * 0.5), 6, { spread: 0.7 }), { seed: 6 + v, scales: 8, scale: 0xf0e0b8 });
  p.R('STALK').fill(makeRamp(0xe0d8c8, 4), (xx, yy) => 2 + (hash(xx, yy) - 0.5), undefined, 0.5);
  paintMycelium(p.R('MYC'), makeRamp(0xc8c0cc, 6, { spread: 0.5 }), { seed: 2, density: 0.08, ground: 3.5, strand: 0xffffff });
  p.R('EYE').fill([0x0a0608, 0x1a1418, 0x4a3a40], () => 1, undefined, 0.3);
  p.R('EYE').set(2, 2, 0xe0e0e8);
  paintCap(p.R('CAP'), 0x5a5048, 0xb83a40, 0xe8e4ea);
}
const RAT_KIT: KitDef = { key: 'spore_rat', variants: 3, W: 128, H: 128, bones: bonesR, layout: layoutR, build: buildR, paint: paintR, sphere: [0, 0.15, -0.1, 0.6] };
/** a spore rat rig (variant 0..2) */
export function buildSporeRat(variant = 0): KitRig { return buildKitRig(RAT_KIT, variant, 0.18); }

// ------------------------------------------------------------------ pose
interface RatDrive { t: number; dt: number; speed: number; ph: number; md: string; seed: number; bite: number; dead: number; burst: number; flinch: number; turn: number; lyaw: number }
function poseRat(K: KitRig, d: RatDrive) {
  const P = K.parts, t = d.t, ud = K.kit.m as Record<string, number>;
  const sp = Math.min(1, d.speed / 4), walk = Math.min(1, d.speed / 0.8);
  const ph = d.ph;
  const run = sp > 0.4 ? 1 : 0;
  // body: a gallop rocks the spine; a walk swings it; at rest it breathes fast
  const breath = Math.sin(t * 9 + d.seed * 6) * 0.012;
  const bob = run ? Math.abs(Math.sin(ph)) * 0.02 : Math.abs(Math.sin(ph)) * 0.006 * walk;
  P.base.position.y = bob - d.dead * 0.0;
  P.pelvis.rotation.set(run ? Math.sin(ph) * 0.18 : 0, d.turn * 0.15, 0);
  P.spine.rotation.set(run ? -Math.sin(ph) * 0.12 : breath, d.turn * 0.12, Math.sin(ph * 0.5) * 0.04 * walk);
  P.chest.rotation.set((run ? Math.sin(ph + 0.6) * 0.1 : 0) + d.bite * -0.15, d.turn * 0.1, 0);
  P.chest.scale.setScalar(1 + breath);
  // head: sniffing (quick nods, the nose working), aiming at what it bites
  const sniff = d.md === 'sniff' || d.md === '' && d.speed < 0.1 ? 1 : 0;
  const nod = sniff * (Math.sin(t * 13) * 0.08 + Math.sin(t * 2.1 + d.seed * 5) * 0.25);
  P.neck.rotation.set(-0.15 * sniff - d.bite * 0.3 + (d.md === 'eat' ? 0.5 : 0) + Math.sin(t * 1.4) * 0.05, d.lyaw * 0.5 + Math.sin(t * 0.9 + d.seed * 3) * 0.3 * sniff, 0);
  P.head.rotation.set(nod + d.bite * 0.25 + (d.md === 'eat' ? Math.sin(t * 14) * 0.12 : 0), d.lyaw * 0.4, Math.sin(t * 0.7) * 0.05);
  P.jaw.rotation.set(d.bite * 0.6 + (d.md === 'eat' ? Math.max(0, Math.sin(t * 14)) * 0.3 : 0) + (d.md === 'retreat' ? 0.25 : 0), 0, 0);
  for (const [s, k] of SIDES) P['ear' + s].rotation.set(-0.3 * (d.md === 'retreat' ? 1 : 0) + Math.sin(t * 5 + k) * 0.05 * sniff, 0, k * (0.2 + (Math.sin(t * 7 + k * 2) > 0.92 ? 0.3 : 0)));
  // legs: a walk (four-beat) or a bound (front pair, hind pair)
  for (const [s, k] of SIDES) {
    const fo = run ? (k > 0 ? 0 : 0.35) : (k > 0 ? 0 : Math.PI);
    const ho = run ? Math.PI + (k > 0 ? 0 : 0.35) : (k > 0 ? Math.PI * 1.5 : Math.PI * 0.5);
    const fa = Math.sin(ph + fo) * (run ? 0.7 : 0.45 * walk), ha = Math.sin(ph + ho) * (run ? 0.8 : 0.45 * walk);
    const fl = Math.max(0, Math.cos(ph + fo)) * (run ? 0.6 : 0.4 * walk), hl = Math.max(0, Math.cos(ph + ho)) * (run ? 0.7 : 0.4 * walk);
    P['fs' + s].rotation.set(fa - d.bite * 0.4, 0, 0);
    P['fe' + s].rotation.set(-fl * 0.9, 0, 0);
    P['fp' + s].rotation.set(fl * 0.6, 0, 0);
    P['hh' + s].rotation.set(ha, 0, 0);
    P['hk' + s].rotation.set(hl * 0.7, 0, 0);
    P['ha' + s].rotation.set(-hl * 0.9, 0, 0);
  }
  // the tail: lags behind the turn, swings with the stride, curls when it stops
  for (let i = 0; i < NT; i++) P['t' + i].rotation.set(i === 0 ? 0.25 : Math.sin(t * 1.3 + i) * 0.04, -d.turn * 0.2 * (i + 1) / NT + Math.sin(t * 2 + i * 0.7 + ph * 0.5) * 0.12, 0);
  // the crest: caps nod on springs with every bound; they swell and split when it bursts
  STK.forEach((_, i) => {
    const lag = (ud['sl' + i] = (ud['sl' + i] ?? 0) + ((run ? -Math.cos(ph) * 0.35 : 0) - (ud['sl' + i] ?? 0)) * Math.min(1, d.dt * 8));
    P['s' + i + 'a'].rotation.set(lag + Math.sin(t * 2 + i) * 0.05, 0, Math.sin(t * 1.6 + i * 2) * 0.06 + d.dead * 0.4 * (i % 2 ? 1 : -1));
    P['s' + i + 'b'].rotation.set(lag * 0.8, 0, 0);
    const cs = (1 + d.burst * 0.8) * (1 - Math.max(0, d.burst - 0.5) * 1.8);
    P['s' + i + 'c'].scale.setScalar(Math.max(0.05, cs));
  });
  P.ec.scale.setScalar(Math.max(0.1, 1 + d.burst * 0.6 - Math.max(0, d.burst - 0.6) * 2));
  // a flinch: it shies sideways
  P.base.rotation.z = d.flinch * 0.2 * Math.sin(t * 30);
  K.kit.F.tint.value.set(1.2, 1.15, 0.9, d.burst * 0.5);
}

function animateRat(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  rig.root.scale.setScalar(0.92 + hashId(c.id, 5) * 0.2);
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'burst') { ud.bu = 0.01; sporeCloud(c.zoneKey, c.x, c.z, { r: 2.1, k: 0.9, dur: 6 }); playAt('bh_plop', c, 1, 14, 0.8); playAt('lumen_puff', c, 0.9, 14, 0.9); }
    else if (f.key === 'squeal') playAt('cower_squeak', c, 0.8, 14, 0.75 + Math.random() * 0.2);
    else if (f.key === 'chitter') playAt('ventling_chitter', c, 0.6, 12, 1.4);
  }
  if (ud.bu) ud.bu = Math.min(1, ud.bu + dt * 2.5);
  const turn = (() => { let df = c.facing - (ud.lf ?? c.facing); while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2; ud.lf = c.facing; return Math.max(-4, Math.min(4, df / Math.max(1e-3, dt))); })();
  ud.trn = (ud.trn ?? 0) + (turn - (ud.trn ?? 0)) * Math.min(1, dt * 6);
  ud.ph = (ud.ph ?? 0) + dt * (c.speed > 1.6 ? 6 + c.speed * 3.2 : 4 + c.speed * 9);
  const ac = attackCurve(rig, c, t);
  poseRat(K, { t, dt, speed: c.dead ? 0 : c.speed, ph: ud.ph, md: c.dead ? '' : (n.md ?? ''), seed: hashId(c.id, 2), bite: Math.max(ac.wind * 0.5, ac.strike), dead: c.dead ? 1 : 0, burst: ud.bu ?? 0, flinch: flinchOf(c), turn: ud.trn, lyaw: 0 });
  K.kit.F.fx.value.y += dt; K.kit.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  if (c.speed > 0.3 && c.visibleToLocal && (ud.sT ?? 0) < t) { ud.sT = t + (c.speed > 2 ? 0.14 : 0.32); playAt('plenum_skitter', c, 0.12 + Math.min(0.2, c.speed * 0.05), 8, 1.5 + Math.random() * 0.2); }
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal) {
    const d = dist(p, c);
    if (n.md === 'hunt' && d < 9) thinkOnce(p, 'srat_hunt', ['Rats. With mushrooms growing out of their backs. And they are coming straight at me.', 'They came out of the fungus. The fungus SENT them.', 'Do not kill them close. They burst. Kick them away first.'][Math.floor(t * 0.3) % 3], 45);
    else if (d < 7) thinkOnce(p, 'spore_rat', ['A rat with a crest of mushrooms. One of its eyes is a mushroom.', 'White fur. No: not fur. Mould. It is growing through it.'][Math.floor(t * 0.2) % 2], 90);
  }
}

// ------------------------------------------------------------------ host brain
const BITE_R = 0.75;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function packOf(c: Creature): Creature[] { const out: Creature[] = []; for (const o of CS().creatures.values()) if (o !== c && o.zoneKey === c.zoneKey && !o.dead && o.sp.key === 'spore_rat' && dist(o, c) < 10) out.push(o); return out; }
function targetOf(c: Creature): Player | null {
  const m = c.mem;
  if (m.wake && G.time - m.wake.t < 30) { const p = G.players.get(m.wake.pid); if (p && !p.body.dead && p.zoneKey === c.zoneKey && dist(p, c) < 26) return p; }
  let best: Player | null = null, bd = 1e9;
  for (const p of playersIn(c.zoneKey)) {
    if (p.body.dead) continue;
    const d = dist(p, c), aware = (c.awareness.get(p.id) ?? 0) >= 0.8 && d < 9;
    if ((aware || d < 3.2 || (m.anger && m.anger.pid === p.id && m.anger.t > G.time)) && d < bd) { bd = d; best = p; }
  }
  return best;
}
function thinkRat(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c), cs = CS(), now = G.time;
  if (!m.init) {
    m.init = 1; m.hunger = rng.float(0.2, 0.8);
    // strays home on the nearest fungal growth
    if (!m.mind) { for (const o of cs.creatures.values()) if (o.zoneKey === c.zoneKey && o.sp.key === 'fungus_node' && !o.dead && dist(o, c) < 30) { c.home = { x: o.x, z: o.z }; break; } }
  }
  m.mdT = (m.mdT ?? 0) + dt;
  m.hunger = Math.min(1, m.hunger + dt / 300);
  if (ev.hurt > 0) {
    fx(c, 'squeal');
    if (c.targetId && G.players.has(c.targetId)) m.anger = { pid: c.targetId, t: now + 25 };
    if (c.hp < c.sp.hp * 0.35 && rng.next() < 0.7) { setMd(c, 'flee'); m.fleeTo = cs.fleeSpot(c, z, c.x - Math.cos(c.facing), c.z - Math.sin(c.facing)); }
    // the pack comes to a squeal
    for (const o of packOf(c)) if (c.targetId) o.mem.wake = { pid: c.targetId, t: now };
  }
  const md: string = n.md ?? '';
  if (md === 'flee') {
    c.setState('flee');
    if (!m.fleeTo || cs.moveTo(c, z, m.fleeTo.x, m.fleeTo.z, c.sp.run, dt, 0.8) || m.mdT > 6) setMd(c, '');
    return true;
  }
  const tgt = targetOf(c);
  // fire: the one thing that turns a pack
  if (tgt && heldFlame(tgt) && dist(tgt, c) < 4) { setMd(c, 'flee'); m.fleeTo = cs.fleeSpot(c, z, tgt.x, tgt.z); fx(c, 'squeal'); return true; }
  if (tgt) {
    const d = dist(tgt, c);
    if (md !== 'hunt' && md !== 'retreat') { setMd(c, 'hunt'); fx(c, 'chitter'); if (d < 12) ruleShown(c); }
    c.targetId = tgt.id;
    if (md === 'retreat') {
      // dart back out, circle, come again
      c.setState('flee');
      const a = Math.atan2(c.z - tgt.z, c.x - tgt.x) + (m.circ ?? 0.6);
      cs.moveTo(c, z, tgt.x + Math.cos(a) * 2.4, tgt.z + Math.sin(a) * 2.4, c.sp.run * 0.85, dt, 0.3);
      if (m.mdT > (m.retT ?? 0.9)) setMd(c, 'hunt');
      return true;
    }
    c.setState('chase');
    // spread round the target: each rat takes its own angle of approach
    const slot = hashId(c.id) * Math.PI * 2;
    const ax = d > 2.5 ? tgt.x + Math.cos(slot) * 1.2 : tgt.x, az = d > 2.5 ? tgt.z + Math.sin(slot) * 1.2 : tgt.z;
    cs.moveTo(c, z, ax, az, d > 6 ? c.sp.run : c.sp.run * 0.9, dt, 0.2);
    if (d < BITE_R + 0.3 && c.attackT <= 0) {
      faceTo(c, tgt.x, tgt.z);
      attack(c, tgt);
      setMd(c, 'retreat'); m.retT = rng.float(0.6, 1.3); m.circ = (rng.next() < 0.5 ? -1 : 1) * rng.float(0.4, 1.1);
    }
    return true;
  }
  // nothing to hunt: scavenge, or nose about home
  if (md === 'hunt' || md === 'retreat') setMd(c, '');
  if (m.hunger > 0.5) {
    const l = larderNear(z, c.x, c.z, 10);
    if (l) {
      if (cs.moveTo(c, z, l.x, l.z, c.sp.walk * 1.6, dt, 0.5)) {
        setMd(c, 'eat'); c.setState('eat'); faceTo(c, l.x, l.z);
        m.eatT = (m.eatT ?? 0) + dt;
        if (m.eatT > 5) { m.eatT = 0; nibble(z, l); m.hunger = Math.max(0, m.hunger - 0.5); }
      }
      return true;
    }
  }
  if (md === 'eat') setMd(c, '');
  c.setState('wander');
  if (!m.goal || m.mdT > (m.wT ?? 4)) {
    // stop and sniff, then a short scurry, never far from the network
    if (rng.next() < 0.45) { m.goal = null; setMd(c, 'sniff'); m.mdT = 0; m.wT = rng.float(1.5, 4); c.speed = 0; c.vx = c.vz = 0; return true; }
    const g = cs.wanderSpot(c, z, 5);
    m.goal = g; m.wT = rng.float(3, 6); m.mdT = 0; setMd(c, '');
  }
  if (m.goal && cs.moveTo(c, z, m.goal.x, m.goal.z, rng.next() < 0.02 ? c.sp.run * 0.6 : c.sp.walk, dt, 0.4)) m.goal = null;
  return true;
}

const RAT = def({
  key: 'spore_rat', name: 'Spore Rat', code: 'SR-11 // PARASITE, MURID HOST (MYCELIAL)', temperament: 'hostile', threat: 2,
  rule: { name: 'THEY BURST', text: 'Spore Rats hunt in packs, sent by a Fungus Mind when its network feels you: they spread round you, dart in to bite your ankles and dart away. Fire turns them. Killed, each one bursts into a cloud of spores that clouds the mind and fills the lungs: kill them at arm\'s length, or step out of the cloud. A gas mask keeps the spores out.', tell: 'Rats with a crest of mushrooms on their backs. A lot of rats.' },
  hp: 16, walk: 0.7, run: 4.3, turn: 9, radius: 0.18, height: 0.25, sight: 9, fov: 2.2, hearing: 1.6, nightVision: true, smell: true,
  attack: { dmg: [2, 5], range: BITE_R, cooldown: 1.2, kinds: ['bite'], corrupt: 0.03, knock: 0.05, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r'] },
  zones: ['undercroft', 'tunnels', 'pools'], weight: 1, group: [3, 5], maxPerZone: 9, diet: 'meat',
  meat: [['meat_raw', 1]],
  flags: { pack: true },
  sounds: { idle: 'ventling_chitter', alert: 'cower_squeak', attack: 'swivel_bite', hurt: 'cower_squeak', death: 'bh_plop', step: 'plenum_skitter' },
  scan: {
    cls: 'Parasite / fungus in a murid host',
    notes: [
      'A large rat grown through with mycelium: felt patches, a crest of caps, a cap in one eye socket.',
      'Hatched and sent by a Fungus Mind. Packs of three to five. Hostile.',
      'They circle and dart: bite, retreat, bite.',
      'Killed, the caps burst: a cloud of spores. Lucidity, lungs. Fire scares them off.',
    ],
  },
  gore: { blood: 'red', tint: 0xd8c0c8, flesh: 0xb05058, sever: ['s0b', 's1b', 's2b', 's3b', 'ec', 'earL', 'earR', 't2', 'head'], head: 'head' },
  build: () => buildSporeRat(0), animate: animateRat, think: thinkRat,
});
onKilled('spore_rat', (c) => fx(c, 'burst'));
onPlayerHit('spore_rat', (p) => { if (Math.random() < 0.3) bus.emit('think', p, ['It bit my ankle— they are all round me.', 'Little teeth. Lots of them.', 'Kick them OFF.'][Math.floor(Math.random() * 3)]); });

export type SporeRatPose = 'idle' | 'sniff' | 'walk' | 'run' | 'bite' | 'retreat' | 'eat' | 'burst' | 'dead';
/** animate a spore rat rig with no game running (call every frame with a running clock); 'bite' loops every 1.4 s, 'burst' every 3 s */
export function poseSporeRat(rig: KitRig, t: number, dt: number, pose: SporeRatPose = 'idle', o: { speed?: number; variant?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant) kitPersonalize(rig, o.variant);
  kitSync(rig);
  const ud = rig.kit.m as Record<string, number>;
  const speeds: Partial<Record<SporeRatPose, number>> = { walk: 0.7, run: 4.2, retreat: 3.6 };
  const speed = o.speed ?? speeds[pose] ?? 0;
  ud.ph = (ud.ph ?? 0) + dt * (speed > 1.6 ? 6 + speed * 3.2 : 4 + speed * 9);
  const bt = t % 1.4, bite = pose === 'bite' ? (bt < 0.3 ? bt / 0.3 * 0.5 : bt < 0.45 ? 1 : Math.max(0, 1 - (bt - 0.45) / 0.4)) : 0;
  poseRat(rig, { t, dt, speed, ph: ud.ph, md: pose === 'sniff' || pose === 'idle' ? 'sniff' : pose === 'eat' ? 'eat' : pose === 'retreat' ? 'retreat' : '', seed: 0.3, bite, dead: pose === 'dead' ? 1 : 0, burst: pose === 'burst' ? Math.min(1, (t % 3) / 1.2) : 0, flinch: 0, turn: 0, lyaw: 0 });
  rig.kit.F.fx.value.y += dt;
}
RAT.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['sniff', 'walk', 'run', 'bite', 'eat', 'burst'][Math.floor(t / 4) % 6]) as SporeRatPose;
  poseSporeRat(rig as KitRig, t, 1 / 60, q, { variant: u.get('v') !== null ? Number(u.get('v')) : undefined });
};
void THREE;
