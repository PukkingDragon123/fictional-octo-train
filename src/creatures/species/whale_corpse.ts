import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { createItem } from '../../items/factory';
import { decalAt } from '../../world/gen/dream_kit';
import type { Zone } from '../../world/zone';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, poke, poked, creatureMenu } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, live } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, flinchOf, hash, usFor } from '../kit/humanoids';
import { chain, sac, blade, paintCap, paintSkin } from '../kit/organic';
import { mkBones, skBlob, pin } from '../kit/fungal';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE WHALE CORPSE — a rorqual fourteen metres long, beached on dry tile where
// no sea has ever been: the drained end of the Poolrooms, the flooded floor of
// the Undercroft. It has been dead a long time and it is still rotting. It lies
// rolled half onto its side with a flipper up in the air like a sail, the
// lower jaw dropped open on the baleen, the throat pleats blown up with gas,
// the skin peeling off it in grey sheets. Something opened its flank and its
// ribs stand up out of the hole like the frame of a boat. Inside, in the dark
// red, the Sea Worms live: the ones that stayed in the whale grew, and they
// lie coiled in its ribs, two and a half metres long. Disturb the carcass
// (come up to the ribs, run beside it, cut at it, hit it) and it heaves, and
// they come out of the hole all at once.
//   whale_corpse   skinned kit rig (hull with an opened flank, inner cavity, ribs,
//                  blubber rim, flaps, dropped jaw with baleen, pleated throat,
//                  raised flipper, flukes, spilled entrails). A set piece: never rolled
//                  from a spawn table; placed at zone generation (z.meta.whale).
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildWhaleCorpse(variant?)                     -> KitRig
//   poseWhaleCorpse(rig, t, dt, pose)              pose: 'idle' | 'heave' | 'burst'
// =====================================================================================

const AX = 1.12, ROLL = 1.12;
const NOSE = 6.7, PED = -6.1;
const HOLE_Z0 = -1.8, HOLE_Z1 = 1.6, HOLE_A0 = 0.42, HOLE_A1 = 2.15;
const SPINE_Z = [5.6, 4.0, 2.4, 0.8, -0.8, -2.4, -4.0, -5.6];
/** hull half-width and half-height along the body (t 0 the nose .. 1 the tail stock) */
function prof(z: number): [number, number] {
  const t = (NOSE - z) / (NOSE - PED);
  const k = t < 0.06 ? 0.2 + (t / 0.06) * 0.45 : t < 0.42 ? 0.65 + 0.35 * Math.sin(((t - 0.06) / 0.36) * Math.PI / 2) : 1 - 0.72 * Math.pow((t - 0.42) / 0.58, 1.4);
  const flat = t < 0.3 ? 0.62 + t * 1.1 : 0.95;
  return [1.5 * k, 1.42 * k * flat];
}
const zw = (bi: (n: string) => number) => (z: number): Wt => {
  const c = SPINE_Z.map((sz, i) => [bi('w' + i), Math.exp(-((z - sz) ** 2) / (2 * 0.9 ** 2))] as [number, number]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const tt = c[0][1] + c[1][1] || 1;
  return [c[0][0], c[0][1] / tt, c[1][0], c[1][1] / tt];
};
/** a point on the hull (unrolled model space): angle a (0 the back, +pi/2 the +x flank, pi the belly), along z, radius factor k */
function hullAt(a: number, z: number, k = 1): V3 {
  const [ru, rv] = prof(z);
  const belly = Math.abs(a) > 1.9 ? 0.12 * (Math.abs(a) - 1.9) : 0;
  return [Math.sin(a) * ru * k, AX + Math.cos(a) * rv * k * (1 + belly), z];
}

function bonesW() {
  const A: [string, string, V3, boolean?][] = [['base', '', [0, 0, 0]], ['roll', 'base', [0, AX, 0]]];
  SPINE_Z.forEach((z, i) => A.push(['w' + i, i ? 'w' + (i - 1) : 'roll', [0, AX, z]]));
  A.push(['jaw', 'w1', [0, AX - 0.45, 3.7], true]);
  A.push(['fr0', 'w2', [0.95, AX - 0.55, 3.1], true], ['fr1', 'fr0', [1.75, AX - 0.25, 2.5]], ['fr2', 'fr1', [2.6, AX + 0.15, 1.7]]);
  A.push(['fk', 'w7', [0, AX, -6.3], true]);
  for (let i = 0; i < 4; i++) A.push(['h' + i, i < 2 ? 'w3' : 'w4', hullAt(i % 2 ? HOLE_A1 : HOLE_A0, i < 2 ? 0.6 : -1.0)]);
  // entrails: out of the hole, over the side, onto the floor (hung off the base: they lie where gravity put them)
  const G0: V3[] = [[0.9, 2.05, 0.1], [1.45, 1.5, 0.3], [1.75, 0.75, 0.45], [2.0, 0.14, 0.7], [2.45, 0.12, 1.15]];
  G0.forEach((p, i) => A.push(['g' + i, i ? 'g' + (i - 1) : 'base', p, i === 2]));
  return mkBones(A);
}
function layoutW(p: Page) {
  p.reg('HIDE', 128, 64); p.reg('HEAD', 64, 32); p.reg('THROAT', 64, 32); p.reg('CAV', 48, 32); p.reg('RIB', 32, 16); p.reg('BLUB', 32, 16);
  p.reg('FIN', 48, 24); p.reg('BALEEN', 16, 32); p.reg('GUT', 32, 16); p.reg('EYE', 8, 8); p.reg('CAP', 8, 8);
}
function buildW(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, rest = x.rest, W = zw(bi);
  const n = 28, us = usFor(n);
  const colA = (j: number) => -Math.PI + (Math.PI * 2 * (j % n)) / n;
  const ringsFor = (zs: number[], k = 1, skin?: (a: number, z: number) => Wt) => zs.map((z, i) => ({
    pts: Array.from({ length: n + 1 }, (_, j) => {
      const a = colA(j), p = hullAt(a, z, k);
      // the skin: wrinkles, sagging rolls and a gas-blown belly
      const wr = 1 + 0.025 * Math.sin(z * 9 + a * 3) + (Math.abs(a) > 2.4 ? 0.03 * Math.sin(z * 22) : 0);
      return [p[0] * wr, AX + (p[1] - AX) * wr, p[2]] as V3;
    }),
    v: 1 - i / Math.max(1, zs.length - 1), w: skin ? (p: V3) => skin(Math.atan2(p[0], p[1] - AX), p[2]) : W(z),
  }));
  const span = (z0: number, z1: number, st: number) => { const out: number[] = []; const N = Math.max(2, Math.ceil(Math.abs(z1 - z0) / st)); for (let i = 0; i <= N; i++) out.push(z0 + ((z1 - z0) * i) / N); return out; };
  const jawSide = (a: number) => Math.abs(a) > 2.3;
  // ---- the head: open below (the jaw is its own shell)
  const headZ = span(NOSE, 3.7, 0.4);
  B.loft(ringsFor(headZ), us, R('HEAD'), 1, { start: [0, AX - 0.1, NOSE + 0.12], startW: [bi('w0'), 1], skip: (j) => jawSide(colA(j)) && jawSide(colA(j + 1)) });
  // ---- the lower jaw, dropped open, with the pleated throat blown up with gas
  const jw = bi('jaw');
  const jawRings = span(NOSE - 0.1, 3.4, 0.4).map((z, i, arr) => ({
    pts: Array.from({ length: n + 1 }, (_, j) => { const a = colA(j); const p = hullAt(a, z, 1.04); const bl = z < 5 ? 0.18 * Math.sin(((5 - z) / 1.6) * Math.PI) : 0; return [p[0] * (1 + bl * 0.4), p[1] - bl * (Math.abs(a) > 2.2 ? 1 : 0), p[2]] as V3; }),
    v: 1 - i / (arr.length - 1), w: [jw, 1] as Wt,
  }));
  B.loft(jawRings, us, R('THROAT'), 2, { start: [0, AX - 0.6, NOSE], startW: [jw, 1], skip: (j) => !(Math.abs(colA(j)) > 1.95 && Math.abs(colA(j + 1)) > 1.95), double: true });
  // baleen: a comb of plates hanging from the upper jaw
  for (const k of [1, -1]) for (let i = 0; i < 12; i++) {
    const z = 3.9 + i * 0.2, [ru, rv] = prof(z);
    const top: V3 = [k * ru * 0.72, AX - rv * 0.55, z], bot: V3 = [k * ru * 0.66, AX - rv * 0.55 - 0.35 - (i % 3) * 0.04, z + 0.05];
    B.quad(top, [top[0], top[1], top[2] + 0.17], [bot[0], bot[1], bot[2] + 0.15], bot, R('BALEEN'), [0, 1, 1, 0], [bi('w1'), 1], true);
  }
  // ---- the body, the flank opened between HOLE_Z1 and HOLE_Z0
  B.loft(ringsFor(span(3.7, HOLE_Z1, 0.4)), us, R('HIDE'), 1, {});
  const inHole = (a: number) => a >= HOLE_A0 && a <= HOLE_A1;
  B.loft(ringsFor(span(HOLE_Z1, HOLE_Z0, 0.4)), us, R('HIDE'), 1, { skip: (j) => inHole(colA(j)) && inHole(colA(j + 1)) });
  B.loft(ringsFor(span(HOLE_Z0, PED, 0.4)), us, R('HIDE'), 1, { end: [0, AX, PED - 0.3], endW: [bi('w7'), 1] });
  // the cavity: dark red meat lining the inside, closed at both ends
  const cavZ = span(HOLE_Z1 + 0.2, HOLE_Z0 - 0.2, 0.4);
  B.loft(ringsFor(cavZ, 0.8), us, R('CAV'), 5, { flip: true, start: [0, AX, HOLE_Z1 + 0.3], end: [0, AX, HOLE_Z0 - 0.3], startW: W(HOLE_Z1), endW: W(HOLE_Z0) });
  // ribs: arches standing up out of the hole, two broken off short
  for (let i = 0; i < 7; i++) {
    const z = HOLE_Z1 - 0.3 - i * 0.5, broken = i === 2 || i === 5;
    const a1 = broken ? 1.2 : 2.5;
    const pts: V3[] = [];
    for (let k = 0; k <= 7; k++) { const a = 0.15 + ((a1 - 0.15) * k) / 7; const p = hullAt(a, z, 0.93 + 0.05 * Math.sin((k / 7) * Math.PI)); pts.push(p); }
    sac(B, R('RIB'), 20 + i, pts, pts.map((_, k) => [0.065 - k * 0.004, 0.05 - k * 0.003] as [number, number]), pts.map(() => W(z)), { n: 6 });
  }
  // the blubber rim round the hole: a fat cream lip, torn
  const rim: V3[] = [];
  for (let k = 0; k <= 10; k++) rim.push(hullAt(HOLE_A0, HOLE_Z1 - ((HOLE_Z1 - HOLE_Z0) * k) / 10, 1.01));
  for (let k = 1; k <= 5; k++) rim.push(hullAt(HOLE_A0 + ((HOLE_A1 - HOLE_A0) * k) / 5, HOLE_Z0, 1.01));
  for (let k = 1; k <= 10; k++) rim.push(hullAt(HOLE_A1, HOLE_Z0 + ((HOLE_Z1 - HOLE_Z0) * k) / 10, 1.01));
  for (let k = 1; k < 5; k++) rim.push(hullAt(HOLE_A1 - ((HOLE_A1 - HOLE_A0) * k) / 5, HOLE_Z1, 1.01));
  rim.push(rim[0]);
  sac(B, R('BLUB'), 30, rim, rim.map((_, k) => [0.1 + 0.04 * Math.sin(k * 1.7), 0.09 + 0.03 * Math.cos(k * 2.3)] as [number, number]), rim.map((p) => W(p[2])), { n: 6, start: false, end: false });
  // flaps of skin and blubber peeled back from the edge
  for (let i = 0; i < 4; i++) {
    const b = bi('h' + i), c = rest('h' + i), up = i % 2 ? -1 : 1;
    const pts: V3[] = [c, [c[0] + 0.25, c[1] + 0.12 * up, c[2] + 0.05], [c[0] + 0.45, c[1] + 0.05 * up, c[2] + 0.12]];
    blade(B, R('BLUB'), pts, [0.5, 0.42, 0.2], [0, 0, 1], [[b, 1], [b, 1], [b, 1]], { edge: 0.5, seed: i * 3 + 1, offset: -0.5 });
  }
  // the flipper, up in the air, knobbed along its leading edge
  chain(B, x, R('FIN'), 40, { bones: ['fr0', 'fr1', 'fr2'], tipLen: 0.9, r: (t) => 0.5 * (1 - t * 0.7), flat: 0.34, n: 10, rings: 4, start: true,
    bump: (a, t) => (Math.cos(a) > 0.5 ? 0.25 * Math.max(0, Math.sin(t * 40)) : 0) });
  // the flukes, and a low dorsal hump
  const fk = bi('fk');
  for (const k of [1, -1]) skBlob(B, R('FIN'), 41 + (k > 0 ? 0 : 1), [k * 1.15, AX, -6.6], [1.25, 0.16, 0.5], { n: 16, rings: 6, w: [fk, 1], bump: (d) => (d[2] > 0 ? -0.3 * Math.abs(d[0]) : 0.1 * Math.sin(d[0] * 7)) });
  skBlob(B, R('HIDE'), 43, [0, AX + prof(-3)[1] * 0.92, -3.0], [0.14, 0.3, 0.5], { n: 10, rings: 5, w: W(-3), bump: (d) => (d[2] < 0 ? 0.3 * d[2] : 0) });
  // the eye: sunk, gone milky
  skBlob(B, R('EYE'), 44, hullAt(1.85, 3.95, 0.99), [0.09, 0.07, 0.1], { n: 8, rings: 5, w: W(3.95) });
  // entrails over the side
  chain(B, x, R('GUT'), 50, { bones: ['g0', 'g1', 'g2', 'g3', 'g4'], tip: [2.2, 0.14, 1.7], r: (t) => 0.2 - t * 0.04, n: 9, rings: 6, knuckle: 0.2, bump: (a, t) => 0.3 * Math.pow(Math.abs(Math.sin(t * 34)), 0.5) - 0.15 + 0.05 * Math.sin(a * 3), bend: (k) => [0.25 * (k % 2 ? 1 : -1), 0, -0.2 * (k % 2 ? -1 : 1)] });
  // a heap of loops on the floor where it all came to rest
  for (let k = 0; k < 3; k++) { const pts: V3[] = []; for (let i = 0; i <= 9; i++) { const a = i * 0.8 + k * 2; pts.push([2.3 + Math.cos(a) * (0.35 + k * 0.12), 0.12 + (i % 3) * 0.02 + k * 0.06, 1.0 + Math.sin(a) * (0.3 + k * 0.1)]); } sac(B, R('GUT'), 52 + k, pts, pts.map(() => [0.12, 0.1] as [number, number]), pts.map(() => [bi('g4'), 1]), { n: 7, bump: (aa, t) => 0.25 * Math.pow(Math.abs(Math.sin(t * 28)), 0.5) - 0.1 }); }
}
function paintW(p: Page, x: BuildCtx) {
  const v = x.variant;
  const RH = makeRamp(mixHex(0x3e4652, 0x4a4a50, v * 0.4), 8, { spread: 0.7 });
  const h = p.R('HIDE');
  // countershading: dark back, pale belly; peeling sheets, barnacle scars, rake marks, rot
  h.fill(RH, (xx, yy) => { const th = (h.deg(xx) * Math.PI) / 180; return 2.4 + (Math.abs(th) > 1.9 ? 3 : Math.abs(th) > 1.3 ? 1.6 : 0) + (h.fbm(xx, yy, 5, 3, 3 + v) - 0.5) * 2.2; }, undefined, 0.6);
  for (let yy = 0; yy < h.h; yy++) for (let xx = 0; xx < h.w; xx++) {
    const n = h.fbm(xx, yy, 4, 3, 41 + v);
    if (n > 0.64) h.set(xx, yy, n > 0.7 ? (hash(xx, yy) < 0.5 ? 0xb8aca0 : 0xa89888) : 0xd8c8b8);
    else if (n < 0.24) h.blend(xx, yy, 0x5a6a3a, 0.35);
  }
  for (let i = 0; i < 40; i++) { const bx = hash(i, 51) * h.w, by = hash(i + 3, 51) * h.h; h.ellipse(bx, by, 1.4, 1.2, 0xe8e0d0, 1); h.set(bx, by, 0x6a6058); }
  for (let i = 0; i < 18; i++) h.crack(hash(i, 61) * h.w, hash(i + 2, 61) * h.h, 14, 10 + hash(i, 63) * 30, 0xd0c8c0, 61 + i, 0.6, 0.05);
  const hd = p.R('HEAD');
  hd.fill(RH, (xx, yy) => 2.4 + (hd.fbm(xx, yy, 4, 2, 7) - 0.5) * 2 + Math.cos((hd.deg(xx) * Math.PI) / 180) * 0.6, undefined, 0.6);
  for (let i = 0; i < 26; i++) hd.blob(hash(i, 71) * hd.w, hash(i + 2, 71) * hd.h * 0.5, 1.5, 1.2, 0xe0d8c8, 1);
  const th = p.R('THROAT');
  th.fill(makeRamp(0xd8c4b8, 7, { spread: 0.6 }), (xx, yy) => 3.2 + (xx % 4 === 0 ? -2.2 : xx % 4 === 1 ? 0.8 : 0) + (th.fbm(xx, yy, 3, 2, 9) - 0.5) * 1.6, undefined, 0.5);
  for (let i = 0; i < 10; i++) th.glow(hash(i, 81) * th.w, hash(i + 1, 81) * th.h, 6, 4, 0x8a6a7a, 0.5);
  const cv = p.R('CAV');
  cv.fill(makeRamp(0x6a1418, 7), (xx, yy) => 2.5 + (cv.fbm(xx, yy, 4, 3, 13) - 0.5) * 3 + Math.sin(yy * 0.6) * 0.6, undefined, 0.6);
  for (let i = 0; i < 16; i++) cv.crack(hash(i, 91) * cv.w, hash(i + 1, 91) * cv.h, 10, 80 + hash(i, 93) * 20, 0xe8d0b0, 91 + i, 0.6, 0.2);
  for (let i = 0; i < 12; i++) cv.glow(hash(i, 95) * cv.w, hash(i + 2, 95) * cv.h, 4, 3, 0xd0a040, 0.4);
  p.R('RIB').fill(makeRamp(0xe8dcb8, 6), (xx, yy) => 3.2 + Math.cos((p.R('RIB').deg(xx) * Math.PI) / 180) * 1 + (hash(xx, yy) < 0.12 ? -2 : 0) + (yy > 12 ? -1 : 0), undefined, 0.5);
  const bl = p.R('BLUB');
  bl.fill(makeRamp(0xf0d8c0, 6), (xx, yy) => 3.5 - (yy / bl.h) * 2 + (hash(xx, yy) - 0.5) * 0.8, undefined, 0.5);
  for (let xx = 0; xx < bl.w; xx++) { bl.set(xx, 0, RH[2]); bl.set(xx, 1, RH[3]); bl.blend(xx, bl.h - 1, 0x9a2a2a, 0.8); bl.blend(xx, bl.h - 2, 0xb84848, 0.5); }
  const fi = p.R('FIN');
  // long pale flippers and fluke undersides, mottled grey on top, scarred
  const RF = makeRamp(0xb8b8bc, 7, { spread: 0.6 });
  fi.fill(RF, (xx, yy) => 3.4 + Math.cos((fi.deg(xx) * Math.PI) / 180) * 1.4 - (Math.cos((fi.deg(xx) * Math.PI) / 180) > 0.4 ? 2.2 * (fi.fbm(xx, yy, 3, 2, 19) > 0.5 ? 1 : 0.4) : 0) + (fi.fbm(xx, yy, 3, 2, 17) - 0.5) * 1.6, undefined, 0.6);
  for (let i = 0; i < 30; i++) fi.blob(hash(i, 101) * fi.w, hash(i + 2, 101) * fi.h, 2, 1.5, 0xe0d8d0, 0.9);
  p.R('BALEEN').fill(makeRamp(0x3a3028, 5), (xx, yy) => 2 + (xx % 2) * 1.2 + (yy / 32) * 1.5 + (hash(xx, yy) - 0.5) * 0.6, undefined, 0.4);
  paintSkin(p.R('GUT'), makeRamp(0xa85868, 6), { seed: 5, veins: 4, vein: 0x5a1a28, mottle: 1.6, glint: 8 });
  p.R('EYE').fill([0x2a2830, 0x6a6a78, 0xb8b8c8, 0xe0e0e8], (xx, yy) => 3 - Math.hypot(xx - 3.5, yy - 3.5) / 1.4, undefined, 0.4);
  paintCap(p.R('CAP'), 0x3e4652, 0xe8d0c0, 0x8a1a20);
}
const WHALE_KIT: KitDef = { key: 'whale_corpse', variants: 2, W: 256, H: 256, bones: () => bonesW(), layout: layoutW, build: buildW, paint: paintW, sphere: [0, 1.4, 0, 8.6] };
/** a whale corpse rig (variant 0..1) */
export function buildWhaleCorpse(variant = 0): KitRig { return buildKitRig(WHALE_KIT, variant, 2.4); }

// ------------------------------------------------------------------ pose: it is dead; the gas and the worms move it
interface WhaleDrive { t: number; dt: number; heave: number; burst: number; flinch: number; seed: number }
function poseWhale(K: KitRig, d: WhaleDrive) {
  const P = K.parts, t = d.t;
  P.roll.rotation.z = ROLL;
  const gas = Math.sin(t * 0.25 + d.seed * 6) * 0.5 + 0.5;
  for (let i = 0; i < SPINE_Z.length; i++) {
    const o = P['w' + i];
    // gas in the gut: the middle swells and sags; worms in the ribs jolt it from inside
    const sw = (i >= 2 && i <= 5 ? 1 : 0.4) * (0.012 * gas + d.heave * 0.05 * Math.max(0, Math.sin(t * 9 + i * 1.7)));
    o.scale.set(1 + sw, 1 + sw * 1.4, 1);
    o.rotation.set(d.heave * Math.sin(t * 7 + i) * 0.006 + d.flinch * 0.004, 0, d.heave * Math.sin(t * 5 + i * 2) * 0.01);
  }
  P.jaw.rotation.set(0.32 + Math.sin(t * 0.3) * 0.015 + d.heave * Math.sin(t * 11) * 0.03, 0, -0.05);
  P.fr0.rotation.set(0.1 + Math.sin(t * 0.2) * 0.01 + d.heave * Math.sin(t * 8) * 0.04, 0, 0);
  P.fr1.rotation.set(0, 0, d.heave * Math.sin(t * 6) * 0.04);
  P.fk.rotation.set(0, 0, -0.18);
  for (let i = 0; i < 4; i++) P['h' + i].rotation.set(0, 0, (d.burst * 0.9 + d.heave * 0.2 * Math.sin(t * 12 + i)) * (i % 2 ? -1 : 1) + Math.sin(t * 0.8 + i) * 0.02);
  for (let i = 0; i < 5; i++) P['g' + i].rotation.set(Math.sin(t * 0.6 + i) * 0.01, 0, 0);
}
function animateWhale(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  if (K.kit.who !== c.id) { K.kit.who = c.id; }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  rig.root.position.x = c.home.x; rig.root.position.z = c.home.z;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'heave') { ud.hv = 1; playAt('leviathan_rumble', c, 1, 30, 0.8); playAt('bh_gurgle', c, 1, 20, 0.45); }
    else if (f.key === 'burst') { ud.bu = 1; playAt('gore_burst', c, 1, 26, 0.5); playAt('arv_squelch', c, 1, 22, 0.5); G.camera?.shake?.(0.35, 0.5, 0.8); }
    else if (f.key === 'cut') playAt('flesh_cut', c, 0.9, 12, 0.8);
  }
  ud.hv = Math.max(0, (ud.hv ?? 0) - dt * 0.25); ud.bu = Math.max(0, (ud.bu ?? 0) - dt * 0.35);
  poseWhale(K, { t, dt, heave: Math.max(ud.hv, n.uneasy ? 0.15 : 0), burst: ud.bu, flinch: flinchOf(c), seed: hashId(c.id) });
  K.kit.F.fx.value.y += dt; K.kit.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.15;
  // a set piece: in view whenever any of it is
  if (live() && G.view) {
    const vis = G.view.vis, f0 = c.facing, cf = Math.cos(f0), sf = Math.sin(f0);
    if (!rig.body.visible) for (const lz of [-6, -3, 0, 3, 6]) if (vis.isVisible(Math.floor(c.x + lz * cf), Math.floor(c.z + lz * sf))) { rig.body.visible = true; rig.root.visible = true; break; }
  }
  // the smell, the flies, the creak of it settling
  if ((ud.cT ?? 0) < t && c.visibleToLocal) { ud.cT = t + 5 + Math.random() * 6; playAt(Math.random() < 0.5 ? 'wood_creak' : 'bh_gurgle', c, 0.35, 18, 0.4 + Math.random() * 0.2); }
  const p = localIn(c);
  if (p && c.visibleToLocal) {
    const d = dist(p, c);
    if (ud.bu > 0.5 && d < 16) thinkOnce(p, 'wc_burst', ['THE RIBS— things are coming out of the ribs—', 'Worms. Out of the whale. Huge. RUN.'][Math.floor(t) % 2], 30);
    else if (n.uneasy && d < 10) thinkOnce(p, 'wc_uneasy', 'Something moved inside it. The whole carcass shifted.', 40);
    else if (d < 18) thinkOnce(p, 'whale_corpse', ['A whale. A WHALE. In here. On dry tile.', 'The smell. God. It has been dead a long time.', 'Its side is open. The ribs stick up like the frame of a boat. Something is coiled up in there.'][Math.floor(t * 0.1) % 3], 120);
  }
}

// ------------------------------------------------------------------ host: the carcass and its worms
/** local (lx across, lz along) -> world */
function toWorld(c: Creature, lx: number, lz: number): { x: number; z: number } {
  const f = c.facing, sf = Math.sin(f), cf = Math.cos(f);
  return { x: c.home.x + lx * sf + lz * cf, z: c.home.z - lx * cf + lz * sf };
}
function toLocal(c: Creature, x: number, z: number): { lx: number; lz: number } {
  const f = c.facing, sf = Math.sin(f), cf = Math.cos(f), dx = x - c.home.x, dz = z - c.home.z;
  return { lx: dx * sf - dz * cf, lz: dx * cf + dz * sf };
}
const NESTS = [[0.3, 0.9], [0.45, -0.1], [0.2, -1.1], [0.5, 0.35]];
function wormsOf(c: Creature): Creature[] { const out: Creature[] = []; for (const o of CS().creatures.values()) if (!o.dead && o.zoneKey === c.zoneKey && o.sp.key === 'sea_worm' && (o.mem.nest as any)?.wid === c.id) out.push(o); return out; }
function hatch(c: Creature, slot: number) {
  const [lx, lz] = NESTS[slot % NESTS.length];
  const s = toWorld(c, lx, lz), e = toWorld(c, 2.7, lz * 1.4);
  const o = CS().spawn('sea_worm', c.zoneKey, s.x, s.z);
  if (!o) return;
  const on = net(o);
  on.g = 1; on.md = 'nest'; on.ny = 1.0;
  o.hp = 120; o.mem.init = 1; o.mem.hunger = 0.5; o.mem.persistent = true; o.mem.noCap = 1;
  o.mem.nest = { wid: c.id, sx: s.x, sz: s.z, ex: e.x, ez: e.z, y: 1.0 + (slot % 2) * 0.2 };
  o.facing = o.targetFacing = c.facing + (slot % 2 ? Math.PI : 0) + rng.float(-0.5, 0.5);
}
function thinkWhale(c: Creature, dt: number): boolean {
  const m = c.mem, n = net(c), ev = pulse(c), now = G.time;
  pin(c);
  if (!m.init) { m.init = 1; m.slot = 0; for (let i = 0; i < 3; i++) hatch(c, m.slot++); m.regrowT = now + 240; }
  // more hatch in the warm rot, slowly
  const worms = wormsOf(c);
  if (worms.length < 3 && now > m.regrowT) { hatch(c, m.slot++); m.regrowT = now + 240; }
  // what disturbs it: a unit at the ribs, running alongside, cutting at it or hitting it
  let who: string | null = null;
  for (const p of playersIn(c.zoneKey)) {
    if (p.body.dead) continue;
    const L = toLocal(c, p.x, p.z);
    const along = Math.abs(L.lz) < 7.5, side = L.lx;
    const nearHole = along && Math.abs(L.lz) < 2.6 && side > -0.5 && side < 4.2;
    const alongside = along && side > -3.5 && side < 4.5;
    const crouched = p.stance === 'sneak' && p.speed < 1.2;
    if ((nearHole && !crouched) || (nearHole && side < 3.0) || (alongside && p.running)) { who = p.id; break; }
  }
  const cut = poked(c, 'cut');
  if (cut) who = cut;
  // a blow (it cannot be hurt, but it feels it): whoever is nearest did it
  if (ev.staggered) { let bd = 9; for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; who = p.id; } } }
  n.uneasy = worms.some((o) => net(o).md === 'nest') && who ? 1 : 0;
  if (who && now > (m.calmT ?? 0) && worms.some((o) => net(o).md === 'nest')) {
    m.disturbed = { pid: who, t: now }; m.calmT = now + 28;
    fx(c, 'heave'); setTimeout(() => { if (CS().creatures.has(c.id)) fx(c, 'burst'); }, 600);
    for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 20) ruleShown(c);
  }
  return true;
}

const WHALE = def({
  key: 'whale_corpse', name: 'Whale Corpse', code: 'WC-00 // CARRION, MYSTICETE (BEACHED, INHABITED)', temperament: 'hazard', threat: 2,
  rule: { name: 'LET IT LIE', text: 'The carcass itself cannot hurt you. The giant Sea Worms coiled in its open ribs can. Come up to the ribs, run beside it, hit it or cut at it and the carcass heaves and every worm in it comes out at once and hunts you for a while before they go back in. Crouch and walk slowly past it. Its blubber, meat, ribs and baleen can be cut from it, but each cut wakes them.', tell: 'A whale, fourteen metres of it, dead on the tiles. The ribs stand up out of its side. Something in there moved.' },
  hp: 9999, walk: 0, run: 0, turn: 0.001, radius: 2.4, height: 3.0, sight: 0.1, fov: 3.1, hearing: 1.0, vibration: true,
  zones: [], weight: 0, maxPerZone: 1, diet: 'none',
  flags: { attached: true, immortal: true },
  sounds: { hurt: 'bh_squelch' },
  scan: {
    cls: 'Carrion / mysticete, beached (inhabited)',
    notes: [
      'A rorqual whale, about fourteen metres, long dead, rotting, rolled on its side.',
      'The flank is open; the ribs are exposed. Giant Sea Worms nest inside.',
      'Disturbing the carcass brings the worms out together. They return after a while.',
      'Blubber, meat, ribs and baleen can be cut from it. Each cut disturbs it.',
    ],
  },
  remains: 'none',
  gore: { blood: 'dark', tint: 0x8a3a3a, flesh: 0x9a3a40, gib: false },
  build: () => buildWhaleCorpse(0), animate: animateWhale, think: thinkWhale,
});
(WHALE as any).handlesSevered = true;
// cut things off it (each cut wakes the worms)
creatureMenu('whale_corpse', (p, c, opts) => {
  const L = toLocal(c, p.x, p.z);
  const at = toWorld(c, (L.lx < 0 ? -1 : 1) * Math.max(2.3, Math.min(3, Math.abs(L.lx))), Math.max(-6, Math.min(6, L.lz)));
  for (const [label, item, verb, secs, lines] of [
    ['Cut blubber', 'whale_blubber', 'Cutting', 3, ['A slab of blubber, cream and pink, as thick as my arm. It smells of lamp oil and the sea.', 'It came away in a sheet. Under it, the meat is nearly black.']],
    ['Cut meat', 'whale_meat', 'Cutting', 3.4, ['Dark red meat, almost purple. It is still cold inside, under all that fat.', 'It does not smell as bad as it should, in there.']],
    ['Saw out a rib', 'whale_rib', 'Sawing', 5, ['A rib as long as I am tall. It took everything I had.', 'It cracked like a tree coming down. Something in the cavity shifted.']],
    ['Pull baleen', 'baleen_plate', 'Pulling', 2.6, ['A plate of baleen: black, bristled down one edge, flexible as a ruler.', 'It came out of the gum with a wet rip.']],
    ['Search the gut', 'ambergris', 'Searching', 4, ['Grey, waxy, it smells of musk and old wood. Ambergris. People used to kill for this.', 'There is a lump of something waxy in here. It smells... sweet.']],
  ] as const) {
    opts.push({
      label, action: () => queueAt(p, at.x, at.z, new UseObjectAction(p, verb, secs, 'pickup', () => {
        if (!CS().creatures.has(c.id)) return;
        poke(p, c, 'cut');
        const key = 'wc_' + item + ':' + c.id, now = G.time;
        const cd = item === 'ambergris' ? 1e9 : item === 'whale_rib' ? 300 : 90;
        if (((p as any)[key] ?? -1e9) > now - cd) { bus.emit('think', p, item === 'ambergris' ? 'There is nothing else in there. Nothing I want to touch.' : 'I have taken what I can from this side for now.'); return; }
        (p as any)[key] = now;
        if (item === 'ambergris' && Math.random() < 0.55) { bus.emit('think', p, 'Nothing in the gut but rot and worm leavings. Ugh.'); return; }
        p.inv.add(createItem(item));
        bus.emit('inventoryChanged', p);
        bus.emit('think', p, lines[Math.floor(Math.random() * lines.length)]);
      }), 1.6, false),
    });
  }
});

// ------------------------------------------------------------------ where it lies: the Poolrooms' Dry End, the Undercroft's open floor
const LEN = 7;
/** can the carcass lie here: its body (3 tiles across) on clear, level floor; a tile of floor on its back side and two on its open side for the worms */
function fits(z: Zone, cx: number, cy: number, f: number, roomOk: (t: string) => boolean): number {
  const cf = Math.round(Math.cos(f)), sf = Math.round(Math.sin(f));
  const h0 = z.heightAt(cx, cy);
  let score = 0;
  for (let lz = -LEN; lz <= LEN; lz++) for (let lx = -2; lx <= 3; lx++) {
    const x = cx + lx * sf + lz * cf, y = cy - lx * cf + lz * sf;
    if (!z.inb(x, y)) return -1;
    const i = z.idx(x, y);
    if (!z.floor[i] || z.solid[i]) return -1;
    if (z.portals.some((p) => p.x === x && p.y === y)) return -1;
    const room = z.rooms[z.room[i]];
    if (!room || !roomOk(room.type)) return -1;
    if (Math.abs(lx) <= 1) {
      if ((z.tileObjs.get(i)?.length ?? 0) > 0) return -1;
      if (Math.abs(z.heightAt(x, y) - h0) > 0.12) return -1;
      if (z.wallN[i] || z.wallW[i]) return -1;
    }
    score++;
  }
  return score;
}
const WHALE_LEVELS: Record<string, (t: string) => boolean> = {
  pools: (t) => t === 'drained_pool',
  undercroft: () => true,
};
bus.on('zoneGenerated', (z: Zone) => {
  const ok = WHALE_LEVELS[z.key];
  if (!ok || z.meta.whale) return;
  const R = new Rng((z.seed ^ 0x3a7e1) >>> 0);
  let best: [number, number, number] | null = null, bs = -1e9;
  const rooms = z.rooms.filter((r) => ok(r.type) && r.id > 0);
  for (let k = 0; k < 700; k++) {
    const room = rooms[Math.floor(R.next() * rooms.length)];
    if (!room) break;
    const cx = room.x0 + Math.floor(R.next() * (room.x1 - room.x0 + 1)), cy = room.y0 + Math.floor(R.next() * (room.y1 - room.y0 + 1));
    const f = R.next() < 0.5 ? 0 : Math.PI / 2;
    if (fits(z, cx, cy, f, ok) < 0) continue;
    let far = 1e9; for (const p of z.portals) far = Math.min(far, Math.hypot(p.x - cx, p.y - cy));
    if (far < 9) continue;
    const mid = Math.hypot(cx - (room.x0 + room.x1) / 2, cy - (room.y0 + room.y1) / 2);
    const s = -mid + Math.min(far, 30) * 0.3 + R.next();
    if (s > bs) { bs = s; best = [cx, cy, f]; }
  }
  if (!best) return;
  const [cx, cy, f] = best;
  const cf = Math.round(Math.cos(f)), sf = Math.round(Math.sin(f));
  z.meta.whale = [cx + 0.5, cy + 0.5, f];
  // the carcass is a wall you walk round
  for (let lz = -LEN + 1; lz <= LEN - 1; lz++) for (let lx = -1; lx <= 1; lx++) { const x = cx + lx * sf + lz * cf, y = cy - lx * cf + lz * sf; z.solid[z.idx(x, y)] = 1; }
  // what has run out of it
  const D = (lx: number, lz: number, tex: string, w: number, d: number) => decalAt(z, tex, cx + 0.5 + lx * sf + lz * cf, cy + 0.5 - lx * cf + lz * sf, w, d, R.next() * 6);
  D(2.4, 0.6, 'decal_blood_pool', 2.6, 2);
  D(0.5, -2.5, 'decal_stain_dark', 5, 3.5); D(0.3, 3.5, 'decal_stain_dark', 4.5, 3);
  D(2.1, -4, 'decal_puddle', 2.2, 1.6); D(-2.1, 2, 'decal_puddle', 2, 1.5); D(-2.2, -3, 'decal_mold', 2, 1.6);
  D(2.8, 2.6, 'decal_blood_drip', 1.4, 1.4); D(3.2, -1.2, 'decal_blood_drip', 1.2, 1.2);
});
const WHALE_SPAWNED = new Set<string>();
let whaleSys = false;
bus.on('enterZone', () => {
  const g: any = G;
  if (whaleSys || !g?.addSystem) return;
  whaleSys = true;
  let acc = 0;
  g.addSystem({
    name: 'whaleCorpses',
    update: (dt: number) => {
      acc += dt; if (acc < 2) return; acc = 0;
      if (G.role === 'client' || !G.creatures) return;
      const zs = new Set<string>(); for (const p of G.players.values()) zs.add(p.zoneKey);
      for (const zk of zs) {
        const z = G.zones.get(zk) as Zone | undefined;
        const at = z?.meta?.whale as [number, number, number] | undefined;
        if (!z || !at) continue;
        if ([...CS().creatures.values()].some((o) => o.zoneKey === zk && o.sp.key === 'whale_corpse')) { WHALE_SPAWNED.add(zk); continue; }
        const c = CS().spawn('whale_corpse', zk, at[0], at[1]);
        if (c) { c.facing = c.targetFacing = at[2]; c.mem.persistent = true; c.mem.noCap = 1; WHALE_SPAWNED.add(zk); }
      }
    },
  });
});

// ------------------------------------------------------------------ stand-alone posing (gallery, the video)
export type WhalePose = 'idle' | 'heave' | 'burst';
/** animate a whale rig with no game running (call every frame with a running clock); 'burst' loops every 5 s */
export function poseWhaleCorpse(rig: KitRig, t: number, dt: number, pose: WhalePose = 'idle') {
  kitSync(rig);
  const bt = t % 5;
  poseWhale(rig, { t, dt, heave: pose === 'heave' ? 1 : pose === 'burst' ? Math.max(0, 1 - bt / 2) : 0, burst: pose === 'burst' ? Math.max(0, 1 - Math.max(0, bt - 0.5) / 2.5) * (bt > 0.5 ? 1 : 0) : 0, flinch: 0, seed: 0.3 });
  rig.kit.F.fx.value.y += dt;
}
WHALE.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  poseWhaleCorpse(rig as KitRig, t, 1 / 60, (u.get('pose') || ['idle', 'heave', 'burst'][Math.floor(t / 6) % 3]) as WhalePose);
};
void sac; void chain;
