import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { StruggleAction } from '../../combat/qte';
import { WALL_H } from '../../world/defs';
import { TF } from '../../world/zone';
import type { Zone } from '../../world/zone';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, faceTo, poke, poked, wallSpotsNear, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, live, lightAt, walkable } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, V3, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash } from '../kit/humanoids';
import { chain, sac, paintCap } from '../kit/organic';
import { attachFilm, attachInner, filmPersonalize } from '../kit/gel';
import { mkBones, skBlob, addMount, setMount } from '../kit/fungal';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE LAND JELLYFISH — a jellyfish that came up out of the Poolrooms' water and
// learned to live without it. The bell, a hand-span across and as clear as
// wet glass, is held up off the floor on eight long trailing tentacles that it
// walks on like a spider walks on its legs, reaching, gripping, pulling the
// bell after. It climbs: up a wall, over onto the ceiling, and along it,
// upside down, slow as a clock hand. Under the bell four frilled mouth-arms
// hang round a mouth that does not bite. It sucks. It waits on the ceiling
// over the places people walk, drops onto the head of whoever passes under,
// spreads its bell over the face and drinks the blood through the skin while
// its tentacles wrap the skull. You can watch the blood fill its stomach.
// Tear it off (the struggle) or have someone knock it off you.
//   land_jelly   three meshes on one skeleton: the opaque tentacles, mouth-arms and
//                manubrium; the inner organs (stomach, gonads, canals, glowing
//                rhopalia) seen through the bell; the translucent bell (gel film)
//                The rig hangs off a mount (fungal.ts addMount) so it can walk
//                on floors, walls and ceilings and sit on a unit's face.
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildLandJelly(variant?)                               -> KitRig
//   poseLandJelly(rig, t, dt, pose, { fed?, speed?, variant? })
//     pose: 'idle' | 'crawl' | 'rear' | 'climb' | 'ceiling' | 'drop' | 'latch' | 'fed' | 'dead'
//   For 'climb' / 'ceiling' / 'drop' the pose sets the rig's own mount (wall in front, at +z).
// =====================================================================================

const NTE = 8, TS = 6, NA = 4, AS = 4;
const BELL_R = 0.28, BELL_Y = 0.36;
const TR = [0.27, 0.4, 0.52, 0.66, 0.78, 0.9], TY = [0.33, 0.26, 0.11, 0.02, 0.005, 0.0];
const tAng = (i: number) => (i / NTE) * Math.PI * 2 + Math.PI / NTE;

function bonesJ() {
  const A: [string, string, V3, boolean?][] = [['base', '', [0, 0, 0]], ['bell', 'base', [0, BELL_Y + 0.06, 0], true], ['crown', 'bell', [0, BELL_Y + 0.22, 0]], ['gut', 'bell', [0, BELL_Y + 0.07, 0]], ['manu', 'bell', [0, BELL_Y - 0.04, 0], true]];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; A.push(['m' + i, 'bell', [Math.cos(a) * BELL_R, BELL_Y, Math.sin(a) * BELL_R]]); }
  for (let i = 0; i < NTE; i++) {
    const a = tAng(i), c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k < TS; k++) A.push(['T' + i + '_' + k, k ? 'T' + i + '_' + (k - 1) : 'bell', [c * TR[k], TY[k], s * TR[k]], k === 1]);
  }
  for (let i = 0; i < NA; i++) {
    const a = (i / NA) * Math.PI * 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    const R = [0.05, 0.09, 0.13, 0.17], Y = [BELL_Y - 0.08, 0.2, 0.1, 0.03];
    for (let k = 0; k < AS; k++) A.push(['O' + i + '_' + k, k ? 'O' + i + '_' + (k - 1) : 'manu', [c * R[k], Y[k], s * R[k]], k === 1]);
  }
  return mkBones(A);
}
const bellW = (bi: (n: string) => number) => (p: V3) => {
  const a = Math.atan2(p[2], p[0]), k = (((a / (Math.PI * 2)) * 8) % 8 + 8) % 8, i0 = Math.floor(k) % 8, i1 = (i0 + 1) % 8, f = k - Math.floor(k);
  const rim = Math.max(0, Math.min(1, (BELL_Y + 0.1 - p[1]) / 0.12));
  const top = Math.max(0, Math.min(1, (p[1] - BELL_Y - 0.08) / 0.12));
  return [bi('m' + i0), rim * (1 - f), bi('m' + i1), rim * f, bi('crown'), top * (1 - rim), bi('bell'), Math.max(0.05, (1 - rim) * (1 - top))];
};

// ------------------------------------------------------------------ the opaque mesh: tentacles, mouth-arms, manubrium
function layoutJ(p: Page) { p.reg('TENT', 16, 48); p.reg('ARM', 32, 32); p.reg('MANU', 16, 16); p.reg('CAP', 8, 8); }
function buildJ(B: SkinB, x: BuildCtx) {
  const bi = x.bi;
  for (let i = 0; i < NTE; i++) {
    chain(B, x, x.R('TENT'), 1 + i, { bones: Array.from({ length: TS }, (_, k) => 'T' + i + '_' + k), tipLen: 0.16, r: (t) => 0.024 * Math.pow(1 - t, 0.8) + 0.004, n: 5, rings: 3, knuckle: 0.08,
      bump: (_, t) => 0.18 * Math.pow(Math.max(0, Math.sin(t * 60 + i)), 6) });
  }
  // the mouth-arms: ruffled curtains, frilled along their edges
  for (let i = 0; i < NA; i++) {
    chain(B, x, x.R('ARM'), 20 + i, { bones: Array.from({ length: AS }, (_, k) => 'O' + i + '_' + k), tipLen: 0.08, r: (t) => 0.04 * (1 - t * 0.6), flat: 0.35, n: 8, rings: 4,
      bump: (a, t) => 0.45 * Math.sin(t * 38 + i) * Math.max(0, Math.abs(Math.sin(a)) - 0.4) });
  }
  sac(B, x.R('MANU'), 30, [[0, BELL_Y + 0.02, 0], [0, BELL_Y - 0.05, 0], [0, BELL_Y - 0.1, 0]], [[0.06, 0.06], [0.045, 0.045], [0.03, 0.03]], [[bi('bell'), 1], [bi('manu'), 1], [bi('manu'), 1]], { n: 8, bump: (a) => 0.15 * Math.sin(a * 4) });
}
function paintJ(p: Page, x: BuildCtx) {
  const v = x.variant;
  const te = p.R('TENT');
  te.fill(makeRamp(mixHex(0xe8c8e0, 0xc8d8f0, v * 0.5), 6), (xx, yy) => 3.2 + Math.cos((te.deg(xx) * Math.PI) / 180) * 1.2 + (yy % 4 === 0 ? 1.4 : 0), undefined, 0.5);
  for (let yy = 0; yy < te.h; yy += 4) for (let xx = 0; xx < te.w; xx += 3) te.set(xx + (yy & 4 ? 1 : 0), yy, 0x8a4a7a);
  const ar = p.R('ARM');
  ar.fill(makeRamp(mixHex(0xe89a7a, 0xd88aa8, v * 0.5), 7), (xx, yy) => 3 + Math.sin(xx * 0.9 + yy * 0.4) * 1.3 + (ar.fbm(xx, yy, 3, 2, 3) - 0.5) * 1.4, undefined, 0.5);
  for (let i = 0; i < 12; i++) ar.crack(hash(i, 5) * ar.w, 0, 20, 90, 0xfff0f0, 5 + i, 0.5, 0.1);
  p.R('MANU').fill(makeRamp(0xd87a8a, 5), (xx, yy) => 2.5 + Math.cos((p.R('MANU').deg(xx) * Math.PI) / 180) + (hash(xx, yy) - 0.5), undefined, 0.5);
  paintCap(p.R('CAP'), 0xe8c8e0, 0xd86a8a, 0x8a2a4a);
}
// ------------------------------------------------------------------ inner organs (through the bell)
function layoutI(p: Page) { p.reg('GUT', 32, 24); p.reg('GON', 32, 16); p.reg('CANAL', 16, 16); p.reg('RHOP', 8, 8); p.reg('CAP', 8, 8); }
function buildI(B: SkinB, x: BuildCtx) {
  const bi = x.bi, g = bi('gut'), b = bi('bell');
  skBlob(B, x.R('GUT'), 1, [0, BELL_Y + 0.07, 0], [0.1, 0.075, 0.1], { n: 12, rings: 7, w: [g, 1], bump: (d) => 0.1 * Math.sin(Math.atan2(d[2], d[0]) * 4) * (1 - Math.abs(d[1])) });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    // a gonad: a fat horseshoe round the stomach
    const pts: V3[] = [];
    for (let k = 0; k <= 6; k++) { const aa = a - 0.6 + (k / 6) * 1.2; pts.push([Math.cos(aa) * 0.15, BELL_Y + 0.1 + Math.sin((k / 6) * Math.PI) * 0.015, Math.sin(aa) * 0.15]); }
    sac(B, x.R('GON'), 10 + i, pts, pts.map((_, k) => [0.022 + Math.sin((k / 6) * Math.PI) * 0.012, 0.016] as [number, number]), pts.map(() => [b, 1]), { n: 6 });
    void c; void s;
  }
  // radial canals out to the rim, the glowing sense-knobs on the margin
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a);
    const pts: V3[] = [0.08, 0.16, 0.23, 0.27].map((r) => [c * r, BELL_Y + 0.17 * Math.sqrt(Math.max(0, 1 - (r / BELL_R) ** 2)) + 0.005, s * r]);
    sac(B, x.R('CANAL'), 20 + i, pts, pts.map(() => [0.008, 0.006] as [number, number]), pts.map((p) => bellW(bi)(p)), { n: 4 });
    const ra = (i / 8) * Math.PI * 2;
    skBlob(B, x.R('RHOP'), 30 + i, [Math.cos(ra) * (BELL_R - 0.01), BELL_Y - 0.005, Math.sin(ra) * (BELL_R - 0.01)], [0.012, 0.012, 0.012], { n: 6, rings: 4, w: [bi('m' + i), 1], emis: 1 });
  }
}
function paintI(p: Page) {
  const gu = p.R('GUT');
  gu.fill(makeRamp(0xb01828, 7), (xx, yy) => 3 + Math.cos((gu.deg(xx) * Math.PI) / 180) * 1.3 + (gu.fbm(xx, yy, 3, 2, 9) - 0.5) * 2.4, undefined, 0.6);
  for (let i = 0; i < 8; i++) gu.blob(hash(i, 3) * gu.w, hash(i + 2, 3) * gu.h, 2, 1.5, 0x4a0810, 0.9);
  const go = p.R('GON');
  go.fill(makeRamp(0xf0a070, 6), (xx, yy) => 3 + Math.sin(xx * 1.3) * 0.8 + (hash(xx, yy) - 0.5) * 1.2, undefined, 0.5);
  p.R('CANAL').fill(makeRamp(0xf0d8f0, 4), () => 2, undefined, 0.3);
  p.R('RHOP').fill([0x60f0ff, 0xb0ffff, 0xffffff], (xx, yy) => 2 - Math.hypot(xx - 3.5, yy - 3.5) / 2.5, undefined, 0.4);
  paintCap(p.R('CAP'), 0xb01828, 0x7a0818, 0x3a0408);
}
// ------------------------------------------------------------------ the bell (film)
function layoutB(p: Page) { p.reg('BELL', 64, 32); p.reg('CAP', 8, 8); }
function buildBell(B: SkinB, x: BuildCtx) {
  const W = bellW(x.bi);
  skBlob(B, x.R('BELL'), 1, [0, BELL_Y, 0], [BELL_R, 0.21, BELL_R], { n: 24, rings: 9, vr: [0.46, 1], w: W,
    bump: (d) => (d[1] < 0.15 ? 0.07 * Math.pow(Math.abs(Math.sin(Math.atan2(d[2], d[0]) * 8)), 0.5) : 0) + (d[1] > 0.7 ? 0.04 : 0) });
  // the margin's velum: a short inward skirt under the rim
  sac(B, x.R('BELL'), 2, [[0, BELL_Y - 0.005, 0], [0, BELL_Y - 0.03, 0]], [[BELL_R * 1.02, BELL_R * 1.02], [BELL_R * 0.82, BELL_R * 0.82]], [W([BELL_R, BELL_Y, 0]), W([BELL_R, BELL_Y, 0])], { n: 24, start: false, end: false });
}
function paintB(p: Page, x: BuildCtx) {
  const v = x.variant;
  const r = p.R('BELL');
  const RB = makeRamp(mixHex(0xb8c8f8, 0xe0b8f0, v * 0.5), 7, { spread: 0.5 });
  r.fill(RB, (xx, yy) => 3.5 + (yy / r.h) * 1.5 + (r.fbm(xx, yy, 3, 2, 4 + v) - 0.5) * 1.4 + (xx % 8 === 0 ? -1.2 : 0), undefined, 0.5);
  for (let i = 0; i < 26; i++) { const px = hash(i, 7 + v) * r.w, py = hash(i + 3, 7) * r.h * 0.7; r.ellipse(px, py, 1, 1, 0xf8f0ff, 0.8); }
  for (let xx = 0; xx < r.w; xx++) { r.blend(xx, r.h - 1, 0x7a5aa8, 0.8); r.blend(xx, r.h - 2, 0x9a7ac8, 0.5); }
  paintCap(p.R('CAP'), 0xc8d0f8, 0xe0e8ff, 0xf8f8ff);
}
const INNER_KIT: KitDef = { key: 'land_jelly_inner', variants: 2, W: 64, H: 64, bones: () => bonesJ(), layout: layoutI, build: buildI, paint: paintI, sphere: [0, 0.4, 0, 1.1] };
const BELL_KIT: KitDef = { key: 'land_jelly_bell', variants: 2, W: 128, H: 64, bones: () => bonesJ(), layout: layoutB, build: buildBell, paint: paintB, sphere: [0, 0.4, 0, 1.1] };
const JELLY_KIT: KitDef = { key: 'land_jelly', variants: 2, W: 64, H: 128, bones: () => bonesJ(), layout: layoutJ, build: buildJ, paint: paintJ, sphere: [0, 0.4, 0, 1.2],
  decorate: (rig, e) => {
    addMount(rig);
    attachInner(rig, INNER_KIT, e.variant);
    attachFilm(rig, BELL_KIT, e.variant, { opacity: 0.42, edge: 1.6, spec: 1.1, rim: 0.5, doubleSide: true, tint: 0.55 });
  } };
/** a land jellyfish rig (variant 0..1) */
export function buildLandJelly(variant = 0): KitRig { return buildKitRig(JELLY_KIT, variant, 0.5); }

// ------------------------------------------------------------------ pose
interface JellyDrive { t: number; dt: number; speed: number; ph: number; seed: number; pump: number; fed: number; rear: number; latch: number; drop: number; dead: number; flinch: number; sting: number; inv: number }
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function setRot(o: THREE.Object3D, axX: number, axZ: number, lift: number, yaw: number, twist = 0) {
  _ax.set(axX, 0, axZ).normalize();
  _q.setFromAxisAngle(_ax, lift);
  _q2.setFromAxisAngle(_up, yaw); _q.premultiply(_q2);
  if (twist) { _q2.setFromAxisAngle(_up, twist); _q.multiply(_q2); }
  o.quaternion.copy(_q);
}
function poseJelly(K: KitRig, d: JellyDrive) {
  const P = K.parts, t = d.t;
  const go = Math.min(1, d.speed / 0.5);
  // the bell: a slow pump on land (it still swims in its sleep), quick hard pulls while it drinks
  const rate = d.latch ? 3.2 : 0.55 + go * 0.4;
  const pump = Math.pow(Math.max(0, Math.sin(t * rate * Math.PI * 2 + d.seed * 7)), 2) * (0.6 + d.pump * 0.4) * (1 - d.dead);
  P.crown.position.y = (P.crown.userData.p0 as THREE.Vector3).y - pump * 0.035 + d.dead * -0.06;
  P.crown.scale.set(1 - pump * 0.06, 1 - pump * 0.12 - d.dead * 0.35, 1 - pump * 0.06);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, o = P['m' + i], p0 = o.userData.p0 as THREE.Vector3;
    const ripple = Math.sin(t * 2.2 + i * 0.8) * 0.01;
    const k = 1 - pump * 0.14 + d.dead * 0.12;
    o.position.set(p0.x * k + Math.cos(a) * ripple, p0.y + pump * 0.02 - d.dead * 0.08, p0.z * k + Math.sin(a) * ripple);
  }
  P.bell.position.y = (P.bell.userData.p0 as THREE.Vector3).y + d.rear * 0.12 - d.dead * 0.3 + Math.sin(t * 1.3) * 0.006 + (d.latch ? -0.12 : 0);
  P.bell.rotation.set(d.rear * -0.4 + go * 0.08 + d.flinch * 0.2, 0, Math.sin(t * 0.9 + d.seed * 4) * 0.03);
  const gs = 0.45 + d.fed * 1.0 + (d.latch ? pump * 0.08 : 0);
  P.gut.scale.set(gs, gs * (0.8 + d.fed * 0.3), gs);
  P.manu.rotation.set(Math.sin(t * 1.1) * 0.15, 0, Math.cos(t * 0.8) * 0.15);
  // tentacles: walking legs. A wave runs round the ring; each in turn lifts, reaches the way it is going and grips
  for (let i = 0; i < NTE; i++) {
    const a = tAng(i), ca = Math.cos(a), sa = Math.sin(a);
    const axX = -sa, axZ = ca; // lifting axis: horizontal, across the tentacle
    const ph = d.ph + i * (Math.PI * 2 / NTE) * 3;
    const lift = Math.max(0, Math.sin(ph)) * 0.5 * go;
    const reach = Math.cos(ph) * 0.35 * go * ca; // forward is +z: a tentacle on the side sweeps fore and aft
    const writhe = Math.sin(t * 1.7 + i * 1.3 + d.seed * 9) * 0.06;
    // a threat display: tentacles up and out, curling
    const rr = d.rear * (0.6 + 0.3 * Math.sin(t * 3 + i));
    // latched on a face: all of them wrap back round the skull
    const wrap = d.latch;
    // falling: flung out in a star, then reaching down
    const fl = d.drop;
    for (let k = 0; k < TS; k++) {
      const o = P['T' + i + '_' + k];
      let l = 0, y = 0;
      if (k === 0) { l = -lift - rr * 0.6 - fl * 0.5 + wrap * 0.9 + d.dead * 0.3; y = reach + writhe; }
      else if (k === 1) { l = lift * 0.6 + rr * 0.4 + wrap * 0.5 + fl * 0.3; y = writhe * 0.5; }
      else { l = writhe * 0.6 + (k > 2 ? -lift * 0.3 : 0) - rr * 0.3 + wrap * (0.45 + 0.08 * Math.sin(t * 6 + i + k)) - d.dead * 0.1 + Math.sin(t * 2.3 + k + i) * 0.05; y = Math.sin(t * 1.1 + i * 2 + k) * 0.08 * (1 - go * 0.5); }
      setRot(o, axX, axZ, l, y + d.sting * (k === 1 ? Math.sin(t * 30 + i) * 0.2 : 0));
    }
  }
  // the mouth-arms ripple, and reach when it drinks
  for (let i = 0; i < NA; i++) {
    const a = (i / NA) * Math.PI * 2 + Math.PI / 4;
    for (let k = 0; k < AS; k++) setRot(P['O' + i + '_' + k], -Math.sin(a), Math.cos(a), Math.sin(t * 2 + i + k * 0.9) * 0.18 + (d.latch ? 0.35 * (k ? 1 : 0) : 0) - d.rear * 0.2, Math.sin(t * 1.4 + i * 2 + k) * 0.25);
  }
  // fed: the bell flushes pink with what is in it
  K.kit.F.tint.value.set(1.35, 0.55, 0.6, d.fed * 0.35);
  void d.inv;
}

// ------------------------------------------------------------------ where it is: the surface frame (every peer)
/** ceiling height over a tile, or 0 when there is none to walk on (open sky, tall rooms) */
function ceilY(z: Zone | null, x: number, zz: number): number {
  if (!z) return WALL_H - 0.04;
  const tx = Math.floor(x), ty = Math.floor(zz);
  if (z.env?.sky || !z.inb(tx, ty) || (z.flags[z.idx(tx, ty)] & TF.OUTDOOR)) return 0;
  for (const l of z.lights) if ((l.kind === 'sky' || l.kind === 'sodium') && l.y > WALL_H) return 0;
  return z.heightAt(tx, ty) + WALL_H - 0.04;
}
const _W = new THREE.Matrix4(), _I = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _Qa = new THREE.Quaternion(), _Qb = new THREE.Quaternion(), _E = new THREE.Euler(), _V = new THREE.Vector3(), _S = new THREE.Vector3(1, 1, 1), _H = new THREE.Vector3(), _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * The model-space (root-relative) transform of the jelly on its surface:
 * wk 0 on the floor .. 1 over the lip onto the ceiling, a wall dw metres ahead (+z);
 * ceil: crawling upside down at height cy; drop 0..1 falling from cy to land at ly.
 */
function surfaceFrame(wk: number, dw: number, cy: number, ceil: number, drop: number, ly: number, out: THREE.Matrix4) {
  if (drop > 0) {
    const f = drop * drop;
    _E.set(0, 0, Math.PI * (1 - ss(0.1, 0.9, drop))); _Q.setFromEuler(_E);
    _V.set(0, cy + (ly - cy) * f, 0);
    return out.compose(_V, _Q, _S);
  }
  if (ceil > 0) { _E.set(0, 0, Math.PI); _Q.setFromEuler(_E); _V.set(0, cy, 0); return out.compose(_V, _Q, _S); }
  // floor -> wall: tip up against the wall; wall -> ceiling: over the lip, upside down
  const tilt = ss(0, 0.14, wk), lip = ss(0.86, 1, wk);
  _E.set(-Math.PI / 2 * tilt, 0, 0); _Qa.setFromEuler(_E);
  _E.set(0, 0, Math.PI); _Qb.setFromEuler(_E);
  _Q.copy(_Qa).slerp(_Qb, lip);
  const h = 0.05 + ss(0.08, 0.9, wk) * (cy - 0.45);
  _V.set(0, h + lip * 0.4, dw * tilt * (1 - lip * 0.6));
  return out.compose(_V, _Q, _S);
}
/** world matrix of a latched jelly: bell over the face, mouth on the skin, tentacles back round the head */
function faceMatrix(p: Player, out: THREE.Matrix4): THREE.Matrix4 {
  const hb = (p as any).rig?.bones?.head as THREE.Object3D | undefined;
  if (hb) hb.getWorldPosition(_H); else _H.set(p.x, (p.y ?? 0) + 1.6, p.z);
  const f = p.facing;
  // model +y (the bell's top) points out of the face, model +z points up the head
  _Y.set(Math.cos(f), 0.12, Math.sin(f)).normalize();
  _Z.set(0, 1, 0);
  _X.crossVectors(_Y, _Z).normalize();
  _Z.crossVectors(_X, _Y).normalize();
  out.makeBasis(_X, _Y, _Z);
  // the mouth (just under the bell) sits on the face, a hand's width in front of the skull
  const k = 0.11 - (BELL_Y - 0.06);
  out.setPosition(_H.x + _Y.x * k, _H.y + _Y.y * k + 0.08, _H.z + _Y.z * k);
  return out;
}

const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
function animateJelly(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 2);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); filmPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>, now = live() ? G.time : t;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'drop') playAt('arv_slide', c, 0.9, 12, 1.3);
    else if (f.key === 'slap') { playAt('arv_squelch', c, 1, 14, 0.9); playAt('bh_squelch', c, 0.8, 12, 1.2); }
    else if (f.key === 'tear') { playAt('gore_tear', c, 1, 14, 1.2); playAt('bh_plop', c, 0.8, 12, 1); }
    else if (f.key === 'hiss') playAt('hush_inhale', c, 0.5, 10, 1.6);
  }
  const sf: string = c.dead ? 'f' : (n.sf ?? 'f');
  ud.ph = (ud.ph ?? 0) + dt * (0.8 + c.speed * 9);
  const z = live() ? zoneOf(c) : null;
  const cy = ceilY(z, c.x, c.z) || WALL_H - 0.6;
  const wk = sm(ud, 'wk', sf === 'w' || sf === 'c' ? (n.wk ?? 0) : 0, 3, dt);
  const ceil = sm(ud, 'ce', sf === 'c' ? 1 : 0, 6, dt);
  const drop = sf === 'x' ? Math.min(1, (now - (n.xt ?? now)) / 0.5) : 0;
  const latch = sm(ud, 'la', sf === 'l' ? 1 : 0, 5, dt);
  ud.fd = sm(ud, 'fds', n.fed ?? 0, 0.5, dt);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt) : 0;
  const lp = sf === 'l' && n.lp ? (G.players?.get(n.lp) as Player | undefined) : undefined;
  if (lp) {
    // on a face: the mount carries it there (root-relative: undo the root's own placement)
    rig.root.updateMatrix();
    _I.copy(rig.root.matrix).invert();
    setMount(K, c, _W.multiplyMatrices(_I, faceMatrix(lp, _W)));
  } else {
    setMount(K, c, surfaceFrame(wk, 0.42, cy - (c.y ?? 0), ceil, drop, (n.ly ?? 0) - (c.y ?? 0), _W));
  }
  const ac = attackCurve(rig, c, t);
  poseJelly(K, { t, dt, speed: c.dead ? 0 : c.speed, ph: ud.ph, seed: hashId(c.id, 4), pump: sf === 'l' ? 1 : 0.3, fed: ud.fd, rear: sm(ud, 'rr', n.md === 'rear' ? 1 : 0, 4, dt), latch, drop: sf === 'x' ? 1 - drop * 0.5 : 0, dead: ud.dk, flinch: flinchOf(c), sting: Math.max(ac.wind, ac.strike), inv: ceil });
  K.kit.F.fx.value.y += dt; K.kit.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.35;
  // the rhopalia: shown in the dark
  if (c.speed > 0.1 && c.visibleToLocal && (ud.sT ?? 0) < t) { ud.sT = t + 0.6; playAt('bh_drip', c, 0.25, 8, 0.8 + Math.random() * 0.4); }
  latchedLocal(c, n, dt);
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && sf !== 'l') {
    const d = dist(p, c);
    if (sf === 'c' && d < 6) thinkOnce(p, 'lj_ceiling', ['Something on the ceiling. Clear. Like a bag of water. Moving.', 'It is upside down up there. The tentacles hang down like a curtain.', 'Do not walk under it. Do NOT walk under it.'][Math.floor(t * 0.2) % 3], 60);
    else if (sf === 'w' && d < 8) thinkOnce(p, 'lj_wall', 'A jellyfish. Climbing the wall. On its tentacles, like legs.', 80);
    else if (n.md === 'rear' && d < 4) thinkOnce(p, 'lj_rear', 'It reared up at me. All its tentacles up. Back off.', 40);
    else if (d < 7) thinkOnce(p, 'land_jelly', ['A jellyfish on the floor. Out of the water. Walking.', 'The tentacles are pulling it along. It is looking for something warm.', 'You can see right through it. There is something red in the middle.'][Math.floor(t * 0.13) % 3], 90);
  }
}

// ------------------------------------------------------------------ latched: the unit's side (runs on the victim's machine)
interface Held { cid: string; t: number; dT: number; rounds: number; next: number; act: StruggleAction | null; won: boolean }
let held: Held | null = null;
function latchedLocal(c: Creature, n: Record<string, any>, dt: number) {
  const p = live() ? G.local : null;
  if (!p) return;
  const mine = n.sf === 'l' && n.lp === p.id && !c.dead && !p.body.dead && p.zoneKey === c.zoneKey;
  if (!mine) { if (held && held.cid === c.id) releaseLocal(p, false); return; }
  if (!held || held.cid !== c.id) {
    held = { cid: c.id, t: 0, dT: 0, rounds: 0, next: 0.5, act: null, won: false };
    p.actions.clear();
    const act = new StruggleAction(p, 'cb_struggle', 600, { x: p.x + Math.cos(p.facing), z: p.z + Math.sin(p.facing) });
    act.name = 'Tear it off';
    p.actions.add(act);
    held.act = act;
    G.pr.fx.hurt = Math.min(1, G.pr.fx.hurt + 0.5);
    G.camera?.punch?.(0.08, 0.5);
    G.audio?.flat?.('dread_hit', 'music', 0.6);
    bus.emit('think', p, ['IT IS ON MY FACE— I CAN\'T SEE—', 'Cold— wet— it is on my FACE—', 'Get it off get it off GET IT OFF'][Math.floor(Math.random() * 3)]);
  }
  const h = held;
  h.t += dt;
  p.vx *= 0.3; p.vz *= 0.3;
  // you see through it: everything swims, pink, dark at the edges; you cannot breathe
  G.pr.fx.blink = Math.max(G.pr.fx.blink, 0.45 + 0.15 * Math.sin(h.t * 6));
  G.pr.fx.desat = Math.max(G.pr.fx.desat, 0.4); G.pr.fx.wobble = Math.max(G.pr.fx.wobble, 0.5);
  G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.25);
  p.body.endurance = Math.max(0, p.body.endurance - dt * 0.05);
  // it drinks: blood through the skin, every pump
  h.dT += dt;
  if (h.dT > 1.1) {
    h.dT = 0;
    const b = p.body as any;
    b.blood = Math.max(35, b.blood - 1.8);
    b.panic = Math.min(100, b.panic + 5);
    if (Math.random() < 0.35) p.body.addInjury('head', 'bite', 0.06, { dirty: true });
    G.audio?.flat?.('wisp_drink', 'sfx' as any, 0.45, 0.6 + Math.random() * 0.2);
  }
  const qte = (G as any).combat?.qte;
  if (qte && !qte.active && h.t > h.next && !h.won) {
    const started = qte.start({
      reason: 'grab', cid: c.id, dur: 5.2 - Math.min(1.2, h.rounds * 0.4), grip: 1.0 + h.rounds * 0.12, act: h.act,
      stages: h.rounds ? [{ kind: 'mash', need: 1 }, { kind: 'alt', need: 1 }, { kind: 'timed', need: 1 }] : [{ kind: 'mash', need: 1 }, { kind: 'alt', need: 1 }],
      onWin: () => { h.won = true; poke(p, c, 'tear'); p.body.addInjury('head', 'laceration', 0.15, { dirty: true }); releaseLocal(p, true); },
      onLose: () => {
        h.rounds++; h.next = h.t + 1.2;
        G.pr.shake = Math.max(G.pr.shake, 0.5);
        bus.emit('think', p, ['It tightened. The tentacles are round the back of my head.', 'My fingers just slide off it.', 'It is pulsing. It is DRINKING.'][h.rounds % 3]);
      },
    });
    if (!started) h.next = h.t + 0.5;
  }
  if (!qte && G.input?.hit?.('shove') && Math.random() < 0.2) { h.won = true; poke(p, c, 'tear'); releaseLocal(p, true); }
}
function releaseLocal(p: Player, tore: boolean) {
  const h = held; held = null;
  if (!h) return;
  if (h.act) { h.act.done = true; if (p.actionAnim === 'cb_struggle') p.stopAnim(); }
  if ((G as any).combat?.qte?.active) (G as any).combat.qte.cancel();
  G.pr.fx.blink = 0;
  bus.emit('think', p, tore ? ['I tore it off. My face. My FACE. It is still stinging.', 'Off. It is off. There are red rings all over my skin.'][Math.floor(Math.random() * 2)] : 'It let go by itself. It is full. Of me.');
}

// ------------------------------------------------------------------ host brain
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function setSf(c: Creature, sf: string) { const n = net(c); if (n.sf !== sf) { n.sf = sf; c.mem.sfT = 0; } }
function wallNear(c: Creature, r: number): { x: number; z: number; nx: number; nz: number } | null {
  const z = zoneOf(c);
  const ws = wallSpotsNear(z, c.x, c.z, r).filter((w) => walkable(z, w.tx, w.ty));
  if (!ws.length) return null;
  ws.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
  const w = ws[Math.min(ws.length - 1, Math.floor(rng.next() * Math.min(3, ws.length)))];
  return { x: w.x + w.nx * 0.42, z: w.z + w.nz * 0.42, nx: w.nx, nz: w.nz };
}
function underCeiling(c: Creature) { return ceilY(zoneOf(c), c.x, c.z) > 0; }
function prey(c: Creature, r: number): { p: Player; d: number } | null {
  let best: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) { if (p.body.dead || p.inVehicle) continue; const d = dist(p, c); if (d < r && (!best || d < best.d)) best = { p, d }; }
  return best;
}
function thinkJelly(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c), cs = CS(), now = G.time;
  if (!m.init) { m.init = 1; m.hunger = rng.float(0.4, 1); n.sf = 'f'; n.wk = 0; n.fed = 0; }
  m.sfT = (m.sfT ?? 0) + dt; m.mdT = (m.mdT ?? 0) + dt;
  m.hunger = Math.min(1, m.hunger + dt / 240);
  n.fed = Math.max(0, (n.fed ?? 0) - dt / 300);
  const sf: string = n.sf ?? 'f';
  // ---------------- latched: drink until full, knocked off, or torn off
  if (sf === 'l') {
    const p = G.players.get(n.lp);
    c.setState('attack');
    if (p) { c.x = p.x + Math.cos(p.facing) * 0.15; c.z = p.z + Math.sin(p.facing) * 0.15; c.vx = c.vz = 0; c.speed = 0; c.facing = c.targetFacing = p.facing + Math.PI; }
    n.fed = Math.min(1.2, (n.fed ?? 0) + dt / 14);
    const off = (why: string) => {
      setSf(c, 'f'); n.lp = null; fx(c, why === 'tear' ? 'tear' : 'slap');
      if (p) { const a = p.facing + rng.float(-0.6, 0.6); c.x = p.x + Math.cos(a) * 1.3; c.z = p.z + Math.sin(a) * 1.3; }
      c.stagger = why === 'full' ? 0.2 : 1.6; m.fleeT = now + 12; m.hunger = why === 'full' ? 0 : m.hunger;
      setMd(c, 'flee');
    };
    if (!p || p.body.dead || p.zoneKey !== c.zoneKey) off('gone');
    else if (poked(c, 'tear') === p.id) off('tear');
    else if (ev.hurt > 0) off('knock');
    else if (n.fed >= 1) off('full');
    return true;
  }
  // ---------------- falling
  if (sf === 'x') {
    c.speed = 0; c.vx = c.vz = 0;
    if (now - (n.xt ?? now) > 0.5) {
      const tg = n.lp ? G.players.get(n.lp) : null;
      if (tg && !tg.body.dead && dist(tg, c) < 1.0) { setSf(c, 'l'); fx(c, 'slap'); ruleShown(c); }
      else { setSf(c, 'f'); n.lp = null; fx(c, 'slap'); c.stagger = 1.2; n.wk = 0; }
    }
    return true;
  }
  if (ev.hurt > 0) {
    m.fleeT = now + 10; setMd(c, 'flee'); fx(c, 'hiss');
    // hit up there, it lets go and falls
    if (sf === 'c' || (sf === 'w' && (n.wk ?? 0) > 0.3)) { setSf(c, 'x'); n.xt = +now.toFixed(2); n.ly = z.heightAt(Math.floor(c.x), Math.floor(c.z)); n.lp = null; return true; }
  }
  // ---------------- on the ceiling: creep, wait over where they walk, drop
  if (sf === 'c') {
    c.setState('stalk');
    const pr = prey(c, 9);
    if (pr && m.hunger > 0.3 && pr.d < 0.95 && now > (m.dropCd ?? 0)) {
      setSf(c, 'x'); n.xt = +now.toFixed(2); n.lp = pr.p.id; n.ly = (pr.p.y ?? 0) + 1.45; fx(c, 'drop'); m.dropCd = now + 8;
      return true;
    }
    // creep toward a unit's path, slower as it closes; with nobody near, drift to somewhere new under the ceiling
    let gx: number | null = null, gz = 0;
    if (pr && m.hunger > 0.3) {
      const lead = pr.p.speed > 0.3 ? 1.6 : 0;
      gx = pr.p.x + Math.cos(pr.p.facing) * lead; gz = pr.p.z + Math.sin(pr.p.facing) * lead;
    } else if (!m.cg || m.sfT > (m.cgT ?? 0)) { m.cg = cs.wanderSpot(c, z, 5); m.cgT = m.sfT + rng.float(10, 20); }
    if (gx === null && m.cg) { gx = m.cg.x; gz = m.cg.z; }
    if (gx !== null) {
      const d = Math.hypot(gx - c.x, gz - c.z);
      if (d > 0.4 && ceilY(z, gx, gz) > 0) cs.moveTo(c, z, gx, gz, pr ? (d < 2.5 ? 0.35 : 0.55) : 0.22, dt, 0.3);
      else { c.speed = 0; c.vx = c.vz = 0; }
      if (!underCeiling(c)) { setSf(c, 'x'); n.xt = +now.toFixed(2); n.ly = z.heightAt(Math.floor(c.x), Math.floor(c.z)); n.lp = null; }
    }
    // full, or long enough up here: back down a wall
    if (m.sfT > 120 && !pr) { const w = wallNear(c, 4); if (w) { m.down = w; setSf(c, 'd'); } }
    return true;
  }
  // ---------------- climbing a wall (up), or coming down one
  if (sf === 'w' || sf === 'd') {
    c.setState('travel'); c.speed = 0.25; c.vx = c.vz = 0;
    if (m.wall) { c.facing = c.targetFacing = Math.atan2(-m.wall.nz, -m.wall.nx); }
    if (sf === 'w') {
      n.wk = Math.min(1, (n.wk ?? 0) + dt / 5.5);
      if (n.wk >= 1) {
        if (underCeiling(c)) { setSf(c, 'c'); c.facing = c.targetFacing = c.facing + Math.PI; }
        else { n.wk = 0.7; setSf(c, 'w'); m.hold = 1; }
      }
      // a wall-hugger (tall rooms): it waits high on the wall and drops on whoever passes under
      if (m.hold) { n.wk = 0.7; const pr = prey(c, 2); if (pr && pr.d < 1.1 && m.hunger > 0.3) { setSf(c, 'x'); n.xt = +now.toFixed(2); n.lp = pr.p.id; n.ly = (pr.p.y ?? 0) + 1.45; fx(c, 'drop'); m.hold = 0; } }
    } else {
      n.wk = Math.max(0, (n.wk ?? 0) - dt / 5);
      if (n.wk <= 0) { setSf(c, 'f'); m.wall = null; }
    }
    return true;
  }
  // ---------------- on the floor
  const pr = prey(c, 6);
  if (m.fleeT && now < m.fleeT) {
    // hurt or knocked off: crawl away fast to the nearest wall and up it
    if (!m.wall) m.wall = wallNear(c, 7);
    if (m.wall && cs.moveTo(c, z, m.wall.x, m.wall.z, c.sp.run, dt, 0.25)) { setSf(c, 'w'); n.wk = 0; m.fleeT = 0; setMd(c, ''); }
    else if (!m.wall) { const fs = pr ? cs.fleeSpot(c, z, pr.p.x, pr.p.z) : cs.wanderSpot(c, z, 6); cs.moveTo(c, z, fs.x, fs.z, c.sp.run, dt, 0.4); }
    return true;
  }
  if (pr && pr.d < 1.6) {
    // close on the floor: a threat display, a sting if you touch it, or (hungry) a leap at the face
    faceTo(c, pr.p.x, pr.p.z); c.speed = 0; c.vx = c.vz = 0; c.setState('warn');
    setMd(c, 'rear');
    if (m.hunger > 0.6 && m.mdT > 1.2 && pr.d < 1.3 && now > (m.dropCd ?? 0) && rng.next() < 0.02) { setSf(c, 'x'); n.xt = +(now - 0.25).toFixed(2); n.lp = pr.p.id; n.ly = (pr.p.y ?? 0) + 1.45; fx(c, 'drop'); m.dropCd = now + 10; return true; }
    if (pr.d < 1.0 && c.attackT <= 0) attack(c, pr.p);
    return true;
  }
  if (n.md === 'rear') setMd(c, '');
  // dark, damp and nobody about: up a wall to the ceiling to wait. Light makes it climb sooner
  m.climbT = (m.climbT ?? rng.float(8, 20)) - dt * (lightAt(z, c.x, c.z) > 0.5 ? 2 : 1);
  if (m.climbT <= 0 && !m.wall) { m.wall = wallNear(c, 6); m.climbT = rng.float(15, 30); }
  if (m.wall) {
    c.setState('travel');
    if (cs.moveTo(c, z, m.wall.x, m.wall.z, c.sp.walk, dt, 0.25)) { setSf(c, 'w'); n.wk = 0; }
    return true;
  }
  c.setState('wander');
  if (!m.goal || m.mdT > (m.wT ?? 6)) { m.goal = cs.wanderSpot(c, z, 6); m.wT = rng.float(6, 12); m.mdT = 0; }
  if (cs.moveTo(c, z, m.goal.x, m.goal.z, c.sp.walk, dt, 0.4)) { m.goal = null; c.speed = 0; }
  return true;
}

const JELLY = def({
  key: 'land_jelly', name: 'Land Jellyfish', code: 'LJ-07 // FAUNA, CNIDARIAN (TERRESTRIAL, SANGUIVOROUS)', temperament: 'ambush', threat: 3,
  rule: { name: 'LOOK UP', text: 'It walks on its tentacles and climbs walls onto the ceiling, where it waits over the places people walk. Pass under it and it drops onto your face and drinks your blood through the skin. Tear it off (fight the struggle), or have someone hit it off you. On the floor it rears up and stings if you come close. Hit it while it is up high and it lets go and falls.', tell: 'Something clear and wet on the ceiling, tentacles hanging down like a bead curtain.' },
  hp: 30, walk: 0.32, run: 1.2, turn: 2.5, radius: 0.3, height: 0.55, sight: 6, fov: 3.0, hearing: 1.2, vibration: true,
  attack: { dmg: [2, 5], range: 1.0, cooldown: 2, kinds: ['burn'], corrupt: 0.02, knock: 0.05, parts: ['hand_l', 'hand_r', 'farm_l', 'farm_r', 'shin_l', 'shin_r'] },
  zones: ['pools', 'tunnels', 'undercroft'], weight: 1, group: [1, 2], maxPerZone: 4, diet: 'meat',
  meat: [['jelly_bell', 1]],
  flags: { attached: true },
  sounds: { idle: 'bh_drip', alert: 'hush_inhale', attack: 'arv_squelch', hurt: 'bh_squelch', death: 'bh_plop' },
  scan: {
    cls: 'Fauna / cnidarian, terrestrial, blood-feeding',
    notes: [
      'A clear bell held up on eight long tentacles it walks on. It climbs walls and ceilings.',
      'It waits on the ceiling over paths and drops onto the head of whoever passes under.',
      'Latched, it drinks blood through the face. Tear it off or have it knocked off.',
      'The stomach shows through the bell. Red means it has fed.',
    ],
  },
  remains: 'decal_puddle',
  gore: { blood: 'pale', tint: 0xe8d0f0, flesh: 0xd8b8e8, sever: ['T0_2', 'T1_2', 'T2_2', 'T3_2', 'T4_2', 'T5_2', 'T6_2', 'T7_2', 'O0_1', 'O1_1'], gib: false },
  build: () => buildLandJelly(0), animate: animateJelly, think: thinkJelly,
});
(JELLY as any).handlesSevered = true;
onPlayerHit('land_jelly', (p) => { bus.emit('think', p, ['It stung me. Like nettles, but it goes on burning.', 'Red welts. In rings. Where the tentacles touched.'][Math.floor(Math.random() * 2)]); });

export type LandJellyPose = 'idle' | 'crawl' | 'rear' | 'climb' | 'ceiling' | 'drop' | 'latch' | 'fed' | 'dead';
/** animate a land jelly rig with no game running (call every frame with a running clock); 'climb' loops up a wall every 6 s, 'drop' every 2 s */
export function poseLandJelly(rig: KitRig, t: number, dt: number, pose: LandJellyPose = 'idle', o: { fed?: number; speed?: number; variant?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant) { kitPersonalize(rig, o.variant); filmPersonalize(rig, o.variant); }
  kitSync(rig);
  const ud = rig.kit.m as Record<string, number>;
  const speed = o.speed ?? (pose === 'crawl' || pose === 'climb' || pose === 'ceiling' ? 0.35 : 0);
  ud.ph = (ud.ph ?? 0) + dt * (0.8 + speed * 9);
  const cy = WALL_H - 0.04;
  if (pose === 'climb') setMount(rig, null, surfaceFrame(Math.min(1, (t % 6) / 5.5), 0.42, cy, 0, 0, 0, _W));
  else if (pose === 'ceiling') setMount(rig, null, surfaceFrame(1, 0.42, cy, 1, 0, 0, _W));
  else if (pose === 'drop') setMount(rig, null, surfaceFrame(0, 0, cy, 0, Math.min(1, (t % 2) / 0.5) || 0.001, 0, _W));
  else setMount(rig, null, _W.identity());
  poseJelly(rig, { t, dt, speed, ph: ud.ph, seed: 0.2, pump: pose === 'latch' ? 1 : 0.3, fed: o.fed ?? (pose === 'fed' || pose === 'latch' ? 0.9 : 0.1), rear: pose === 'rear' ? 1 : 0, latch: pose === 'latch' ? 1 : 0, drop: pose === 'drop' ? 1 - Math.min(1, (t % 2) / 0.5) * 0.5 : 0, dead: pose === 'dead' ? 1 : 0, flinch: 0, sting: 0, inv: pose === 'ceiling' ? 1 : 0 });
  rig.kit.F.fx.value.y += dt;
}
JELLY.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['idle', 'crawl', 'rear', 'climb', 'latch', 'fed'][Math.floor(t / 5) % 6]) as LandJellyPose;
  poseLandJelly(rig as KitRig, t, 1 / 60, q, { variant: u.get('v') !== null ? Number(u.get('v')) : undefined });
};
void sac; void hash;
