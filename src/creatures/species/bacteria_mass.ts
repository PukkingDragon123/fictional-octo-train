import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { op } from '../../game/ops';
import { worldMaterial } from '../../gfx/materials';
import { HumanRig, SKIN_TONES, HAIR_COLORS, HAIR_STYLES, type Appearance, type Outfit, type Pose as HPose } from '../../entities/humanRig';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, faceTo, onKilled, onPlayerHit, HeldAction } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, heldFlame, live } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash } from '../kit/humanoids';
import { chain, sac, paintCap } from '../kit/organic';
import { attachFilm, filmPersonalize, uprightDead, films } from '../kit/gel';
import { mkBones, skBlob, paintSlime } from '../kit/fungal';
import { larderNear, type Larder } from '../../world/remains';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE BACTERIA MASS — a colony: a heap of glistening, yellow-grey slime the size
// of an armchair that crawls. It eats the dead. It oozes to a corpse or the
// remains of a unit, flows over it and takes it in, and over days what it
// took in comes apart inside it; you can watch it happen through the slime.
// There are people in there. One lies on its back just under the skin of the
// thing with its face pressed up to the surface and its mouth open, one arm
// out through the front, the hand still grasping at the floor. Another is
// curled up deep inside like a sleeper. Their legs and fingers have already
// gone. When it has eaten enough it pinches itself in two. It leaves the
// living alone, mostly: unless you stand in its way, hurt it, or lie bleeding
// on the floor in front of it, which is the same as being dead to it.
//   bacteria_mass  skinned kit rig (colony crusts, pustules, bones, a slime skirt)
//                  + a translucent gel film (the body and its pseudopods) + two
//                  HumanRigs from the one human base (pooled), half-dissolved inside
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildBacteriaMass(variant?)                           -> KitRig
//   poseBacteriaMass(rig, t, dt, pose, { mass?, speed? })
//     pose: 'idle' | 'ooze' | 'absorb' | 'engulf' | 'split' | 'recoil' | 'dead'
// =====================================================================================

const NL = 6;
const lAng = (i: number) => (i / NL) * Math.PI * 2 + Math.PI / NL;
const SKIRT_R = 1.05;

function bonesB() {
  const A: [string, string, V3, boolean?][] = [['base', '', [0, 0, 0]], ['core', 'base', [0, 0.42, 0]], ['top', 'core', [0, 0.82, -0.05], true], ['ori', 'top', [0.05, 0.94, 0.12]]];
  for (let i = 0; i < NL; i++) { const a = lAng(i); A.push(['l' + i, 'core', [Math.cos(a) * 0.62, 0.3, Math.sin(a) * 0.58], true]); }
  // pseudopods: the leading foot (front), two flank feet, one trailing
  const PS: [number, number][] = [[Math.PI / 2, 0.85], [Math.PI / 2 + 1.1, 0.75], [Math.PI / 2 - 1.1, 0.75], [-Math.PI / 2, 0.7]];
  PS.forEach(([a, r], i) => { for (let k = 0; k < 3; k++) A.push(['p' + i + '_' + k, k ? 'p' + i + '_' + (k - 1) : 'core', [Math.cos(a) * (r + k * 0.22), 0.18 - k * 0.06, Math.sin(a) * (r + k * 0.22)], k === 1]); });
  // where the two people are held (the HumanRigs hang here)
  A.push(['vicA', 'core', [0, 0.12, -0.75]], ['vicB', 'core', [0.18, 0.1, -0.15]]);
  for (let i = 0; i < 5; i++) A.push(['pu' + i, 'l' + (i % NL), [Math.cos(i * 1.9) * 0.6, 0.62 + (i % 3) * 0.12, Math.sin(i * 1.9) * 0.55]]);
  return mkBones(A);
}
const nearLobes = (bi: (n: string) => number) => (p: V3): Wt => {
  const a = Math.atan2(p[2], p[0]);
  const ws = Array.from({ length: NL }, (_, i) => { let d = Math.abs(a - lAng(i)); if (d > Math.PI) d = Math.PI * 2 - d; return [i, Math.exp(-(d * d) / 0.35)] as [number, number]; }).sort((x, y) => y[1] - x[1]);
  const up = Math.max(0, Math.min(1, (p[1] - 0.55) / 0.35));
  const side = 1 - up, t = ws[0][1] + ws[1][1];
  return [bi('l' + ws[0][0]), (side * ws[0][1]) / t * 0.8, bi('l' + ws[1][0]), (side * ws[1][1]) / t * 0.8, bi('top'), up * 0.8, bi('core'), 0.2];
};

// ------------------------------------------------------------------ the opaque mesh: crusts, pustules, bones, the skirt
function layoutK(p: Page) { p.reg('CRUST', 48, 32); p.reg('PUS', 16, 16); p.reg('BONE', 32, 16); p.reg('SKIRT', 64, 16); p.reg('GUTS', 32, 24); p.reg('CAP', 8, 8); }
function buildK(B: SkinB, x: BuildCtx) {
  const bi = x.bi, v = x.variant, W = nearLobes(bi);
  // the skirt: a slick of slime on the floor round it
  sac(B, x.R('SKIRT'), 1, [[0, 0.012, 0], [0, 0.03, 0], [0, 0.06, 0]], [[SKIRT_R + 0.15, SKIRT_R + 0.1], [SKIRT_R * 0.92, SKIRT_R * 0.88], [SKIRT_R * 0.75, SKIRT_R * 0.7]], [[bi('base'), 1], [bi('base'), 0.5, bi('core'), 0.5], [bi('core'), 1]], {
    n: 22, start: false, end: false, bump: (a, t) => (1 - t) * 0.16 * Math.sin(a * 5 + v * 2) + 0.08 * Math.sin(a * 13),
  });
  // colony crusts: flat rings of colour on the skin of it (opaque, sitting just proud of the gel)
  for (let i = 0; i < 12; i++) {
    const a = hash(i, 3 + v) * Math.PI * 2, el = 0.15 + hash(i, 5 + v) * 1.1;
    const d: V3 = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)];
    const c: V3 = [d[0] * 0.96, 0.42 + d[1] * 0.56, d[2] * 0.92];
    const s = 0.08 + hash(i, 7) * 0.12;
    skBlob(B, x.R('CRUST'), 10 + i, c, [s, s * 0.35, s], { n: 9, rings: 4, vr: [0.5, 1], w: W(c), bump: (dd) => 0.15 * Math.sin(Math.atan2(dd[2], dd[0]) * 6 + i) });
  }
  // pustules: blisters that swell and burst
  for (let i = 0; i < 5; i++) {
    const b = bi('pu' + i), c = x.rest('pu' + i);
    skBlob(B, x.R('PUS'), 30 + i, [c[0] * 1.1, c[1] + 0.02, c[2] * 1.1], [0.07, 0.06, 0.07], { n: 8, rings: 5, w: [b, 1] });
  }
  // what is left of earlier meals: ribs, a femur, loose vertebrae, coils of something
  for (let i = 0; i < 5; i++) {
    const z0 = 0.15 - i * 0.07, pts: V3[] = [];
    for (let k = 0; k <= 4; k++) { const a = -0.3 + (k / 4) * Math.PI * 0.9; pts.push([0.35 + Math.cos(a) * 0.22, 0.32 + Math.sin(a) * 0.16, z0]); }
    sac(B, x.R('BONE'), 40 + i, pts, pts.map(() => [0.014, 0.012] as [number, number]), pts.map((p) => W(p)), { n: 5 });
  }
  sac(B, x.R('BONE'), 50, [[-0.4, 0.2, 0.25], [-0.15, 0.24, 0.1], [0.1, 0.22, -0.05]], [[0.035, 0.035], [0.022, 0.022], [0.035, 0.035]], [[bi('l2'), 1], [bi('core'), 1], [bi('l0'), 1]], { n: 6 });
  for (let i = 0; i < 6; i++) skBlob(B, x.R('BONE'), 60 + i, [-0.3 + i * 0.09, 0.15 + (i % 2) * 0.03, -0.4 + i * 0.03], [0.025, 0.02, 0.025], { n: 6, rings: 4, w: [bi('core'), 1] });
  const gp: V3[] = []; for (let k = 0; k <= 10; k++) { const a = k * 0.9; gp.push([Math.cos(a) * (0.12 + k * 0.012) - 0.15, 0.3 + Math.sin(k * 1.3) * 0.05, Math.sin(a) * (0.12 + k * 0.012) + 0.2]); }
  sac(B, x.R('GUTS'), 70, gp, gp.map(() => [0.035, 0.03] as [number, number]), gp.map((p) => W(p)), { n: 6 });
}
function paintK(p: Page, x: BuildCtx) {
  const v = x.variant;
  const cr = p.R('CRUST');
  const cols = [[0xd8c040, 0x8aa030], [0xd86a8a, 0xe8d0a0], [0x6aa070, 0xc8b040]][v % 3];
  cr.fill(makeRamp(cols[0], 6), (xx, yy) => 2.5 + Math.sin(Math.hypot(xx - cr.w / 2, yy - cr.h / 2) * 1.1) * 1.2 + (cr.fbm(xx, yy, 3, 2, 3) - 0.5) * 1.5, undefined, 0.5);
  for (let i = 0; i < 10; i++) cr.ellipse(hash(i, 4) * cr.w, hash(i + 3, 4) * cr.h, 2 + hash(i, 6) * 3, 2, cols[1], 0.7);
  for (let i = 0; i < 20; i++) cr.blend(hash(i, 9) * cr.w, hash(i + 1, 9) * cr.h, 0xffffff, 0.7);
  const pu = p.R('PUS');
  pu.fill(makeRamp(0xe8d870, 6), (xx, yy) => 4 - Math.hypot(xx - 8, yy - 4) / 4, undefined, 0.5);
  pu.set(6, 3, 0xffffff); pu.set(7, 3, 0xfff8e0);
  p.R('BONE').fill(makeRamp(0xe0d4b0, 5), (xx, yy) => 3 + Math.cos((p.R('BONE').deg(xx) * Math.PI) / 180) * 0.8 + (hash(xx, yy) < 0.1 ? -1.5 : 0), undefined, 0.5);
  paintSlime(p.R('SKIRT'), makeRamp(mixHex(0xb8a868, 0xa89070, v * 0.4), 7), { seed: 5 + v, colonies: 8, flecks: 30 });
  const gu = p.R('GUTS');
  gu.fill(makeRamp(0xa04848, 6), (xx, yy) => 3 + Math.sin(yy * 0.9) * 1 + (hash(xx, yy) - 0.5), undefined, 0.5);
  paintCap(p.R('CAP'), 0xc8b870, 0xb84848, 0x5a2020);
}
// ------------------------------------------------------------------ the gel: the body and its pseudopods
function layoutF(p: Page) { p.reg('GEL', 64, 48); p.reg('POD', 32, 24); p.reg('CAP', 8, 8); }
function buildF(B: SkinB, x: BuildCtx) {
  const bi = x.bi, v = x.variant, W = nearLobes(bi);
  skBlob(B, x.R('GEL'), 1, [0, 0.4, 0], [0.98, 0.58, 0.92], { n: 26, rings: 12, vr: [0.36, 1], w: W,
    bump: (d) => 0.1 * Math.sin(d[0] * 5 + v) * Math.sin(d[2] * 4.3 + d[1] * 2) + 0.06 * Math.sin(d[0] * 11 + d[2] * 9) + (d[1] < 0 ? 0.12 * d[1] : 0) + (d[1] > 0.85 && d[2] > 0 ? -0.08 : 0) });
  // the top lobe, where the opening is
  skBlob(B, x.R('GEL'), 2, [0, 0.82, -0.05], [0.42, 0.24, 0.4], { n: 16, rings: 7, vr: [0.3, 1], w: [bi('top'), 1], bump: (d) => (d[1] > 0.8 && d[2] > 0.1 ? -0.3 : 0) + 0.05 * Math.sin(d[0] * 9) });
  for (let i = 0; i < 4; i++) {
    chain(B, x, x.R('POD'), 10 + i, { bones: ['p' + i + '_0', 'p' + i + '_1', 'p' + i + '_2'], tipLen: 0.18, r: (t) => 0.22 * (1 - t * 0.7) + 0.03, flat: 0.45, n: 9, rings: 3, start: true, bump: (a, t) => 0.12 * Math.sin(a * 3 + t * 9 + i) });
  }
}
function paintF(p: Page, x: BuildCtx) {
  const v = x.variant;
  const RG = makeRamp(mixHex(0xc8c088, 0xd0a8a0, v * 0.45), 7, { spread: 0.55 });
  paintSlime(p.R('GEL'), RG, { seed: 11 + v, colonies: 14, colony: [mixHex(RG[1], 0x8aa030, 0.5), mixHex(RG[2], 0xd86a8a, 0.4)], flecks: 40 });
  paintSlime(p.R('POD'), RG, { seed: 21 + v, colonies: 5, flecks: 18 });
  paintCap(p.R('CAP'), 0xc8c088, 0xe8e0b0, 0xa89060);
}
const GEL_KIT: KitDef = { key: 'bacteria_mass_gel', variants: 3, W: 128, H: 64, bones: () => bonesB(), layout: layoutF, build: buildF, paint: paintF, sphere: [0, 0.5, 0, 1.8] };

// ------------------------------------------------------------------ the people in it: the one human base (HumanRig), pooled
const POOL: HumanRig[] = [];
function inScene(o: THREE.Object3D) { while (o.parent) o = o.parent; return !!(o as any).isScene; }
function appFor(seed: number, k: number): Appearance {
  const h = (i: number) => hash(seed * 31 + k * 7, i);
  return { skin: SKIN_TONES[Math.floor(h(1) * SKIN_TONES.length)], hair: HAIR_COLORS[Math.floor(h(2) * 5)], hairStyle: HAIR_STYLES[Math.floor(h(3) * HAIR_STYLES.length)], face: Math.floor(h(4) * 6), build: 'slim', height: 0.96 + h(5) * 0.08, bodyShape: h(6), facialHair: 'none', age: 0.2 + h(7) * 0.6, scars: 0, freckles: 0 };
}
// what the colony has done to them: bleached, stripped, wet through; legs and fingers gone
const OUT_A: Outfit = { torso: { tex: 'c_bare', color: 0xd8c8b0, wear: 1, blood: 0.6 }, cond: { pale: 3, wet: 3, dirt: 1, corrupt: 1, expr: 'pain', blood: { head: 1, torso_u: 2, uarm_r: 2, farm_r: 3, hand_r: 3 }, sev: ['thigh_l', 'thigh_r', 'hand_l'] } };
const OUT_B: Outfit = { torso: { tex: 'c_bare', color: 0xd0c0a8, wear: 1 }, legs: { tex: 'c_bare', color: 0xd0c0a8, wear: 1 }, cond: { pale: 3, wet: 3, corrupt: 2, expr: 'fear', blood: { torso_l: 2, thigh_l: 2 }, sev: ['farm_l', 'shin_r', 'foot_l'] } };
function takeHuman(app: Appearance, out: Outfit): HumanRig {
  const free = POOL.find((h) => !inScene(h.root));
  let hr: HumanRig;
  if (free) { free.root.removeFromParent(); hr = free; hr.setAppearance(app); }
  else {
    hr = new HumanRig(app, worldMaterial({}));
    POOL.push(hr);
    hr.faceAnim = false;
    hr.skin.frustumCulled = false;
    (hr.skin as any).clone = () => new THREE.Group();
  }
  hr.setOutfit(out);
  return hr;
}
function attachHumans(rig: KitRig, seed: number) {
  const m = rig.kit.m;
  for (const k of ['hA', 'hB']) if (m[k]) { (m[k] as HumanRig).root.removeFromParent(); m[k] = null; }
  // A: on its back just under the surface, face up to the skin of it, one arm out through the front
  const a = takeHuman(appFor(seed, 1), OUT_A);
  a.root.scale.setScalar(0.82);
  a.root.rotation.set(1.25, Math.PI, 0);
  rig.parts.vicA.add(a.root);
  // B: curled up inside, deep, small
  const b = takeHuman(appFor(seed, 2), OUT_B);
  b.root.scale.setScalar(0.62);
  b.root.rotation.set(0.35, 2.1, 1.45);
  b.root.position.set(0, 0.0, 0);
  rig.parts.vicB.add(b.root);
  m.hA = a; m.hB = b; m.hSeed = seed;
}
const J3 = (x: number, y = 0, z = 0): [number, number, number] => [x, y, z];
function poseHumans(K: KitRig, t: number, seed: number, d: { reach: number; dead: number; absorb: number }) {
  const a = K.kit.m.hA as HumanRig | undefined, b = K.kit.m.hB as HumanRig | undefined;
  if (a) {
    // the face pressed up under the surface; the right arm out through the front, clawing the floor
    const claw = Math.max(0, Math.sin(t * 0.9 + seed * 7)) * (1 - d.dead);
    const P: HPose = {
      spine: J3(-0.15), chest: J3(-0.1), neck: J3(-0.35 + Math.sin(t * 0.4 + seed) * 0.08), head: J3(-0.45 + Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.3 + seed * 3) * 0.25, 0.1),
      uarmR: J3(-2.6 + d.reach * 0.3 + claw * 0.25, 0.2, -0.2), farmR: J3(-0.25 - claw * 0.5, 0, 0), handR: J3(0.5 + claw * 0.4, 0, 0),
      uarmL: J3(-0.4, 0, 0.5), farmL: J3(-1.2, 0, 0),
      gripR: 0.2 + claw * 0.75, gripL: 0.6, blink: 0.15 + 0.1 * Math.sin(t * 0.5),
    };
    a.applyPose(P);
    a.faceTick(0.016);
  }
  if (b) {
    // a sleeper: knees to its chest, arms round them; now and then it shudders
    const sh = Math.pow(Math.max(0, Math.sin(t * 0.37 + seed * 5)), 12) * (1 - d.dead);
    const P: HPose = {
      spine: J3(0.5 + sh * 0.1), chest: J3(0.3), neck: J3(0.3), head: J3(0.5 + sh * 0.2, 0, 0.2),
      thighL: J3(-2.0), thighR: J3(-1.8, 0.1), shinL: J3(2.2), shinR: J3(2.0),
      uarmL: J3(-1.2, 0, 0.3), uarmR: J3(-1.1, 0, -0.3), farmL: J3(-1.6), farmR: J3(-1.5),
      gripL: 0.9, gripR: 0.9, blink: 0.9,
    };
    b.applyPose(P);
    b.root.position.y = Math.sin(t * 0.25 + seed) * 0.02 - d.absorb * 0.04;
    b.root.rotation.z = 1.45 + sh * 0.12 + Math.sin(t * 0.2) * 0.03;
    b.faceTick(0.016);
  }
}

// ------------------------------------------------------------------ the kit
const MASS_KIT: KitDef = { key: 'bacteria_mass', variants: 3, W: 128, H: 128, bones: () => bonesB(), layout: layoutK, build: buildK, paint: paintK, sphere: [0, 0.5, 0, 1.8],
  decorate: (rig, e) => {
    attachFilm(rig, GEL_KIT, e.variant, { opacity: 0.5, edge: 1.5, spec: 1.2, rim: 0.4, tint: 0.65 });
    attachHumans(rig, e.variant * 13 + 1);
  } };
/** a bacteria mass rig (variant 0..2) */
export function buildBacteriaMass(variant = 0): KitRig { return buildKitRig(MASS_KIT, variant, 0.8); }

// ------------------------------------------------------------------ pose
interface MassDrive { t: number; dt: number; speed: number; ph: number; seed: number; absorb: number; engulf: number; split: number; recoil: number; dead: number; flinch: number; bite: number }
function poseMass(K: KitRig, d: MassDrive) {
  const P = K.parts, t = d.t;
  const go = Math.min(1, d.speed / 0.3);
  // amoeboid crawl: the leading foot pushes out, the body flows into it, the trailing foot lets go
  const cyc = d.ph, ext = (Math.sin(cyc) * 0.5 + 0.5) * go;
  const breathe = Math.sin(t * 0.8 + d.seed * 4) * 0.03;
  const flat = d.dead * 0.6 + d.absorb * 0.18;
  P.core.scale.set(1 + breathe + d.engulf * 0.15 + flat * 0.4 + d.split * 0.25, 1 - breathe * 0.5 - flat * 0.6 + d.engulf * 0.1, 1 + breathe + d.engulf * 0.2 + flat * 0.3 - d.split * 0.15);
  P.core.position.z = (P.core.userData.p0 as THREE.Vector3).z + ext * 0.12 + d.engulf * 0.15 - d.recoil * 0.2;
  P.core.position.y = (P.core.userData.p0 as THREE.Vector3).y - flat * 0.18;
  for (let i = 0; i < NL; i++) {
    const a = lAng(i), o = P['l' + i], p0 = o.userData.p0 as THREE.Vector3;
    const wave = Math.sin(t * 1.4 - i * 1.05 + d.seed * 9) * 0.06;
    const fwd = Math.sin(a) > 0.3 ? ext * 0.18 : Math.sin(a) < -0.3 ? -ext * 0.08 : 0;
    // splitting: pinches in across the middle; the two halves pull apart left and right
    const pinch = d.split * (Math.cos(a) > 0 ? 1 : -1) * 0.25;
    o.position.set(p0.x + pinch + Math.cos(a) * wave, p0.y + wave * 0.5, p0.z + fwd + Math.sin(a) * wave);
    const s = 1 + wave * 1.5 + d.engulf * 0.15;
    o.scale.set(s, s * (1 - flat * 0.3), s);
  }
  P.top.position.y = (P.top.userData.p0 as THREE.Vector3).y + Math.sin(t * 0.9) * 0.03 - flat * 0.15 - d.split * 0.12;
  P.top.scale.set(1 + d.absorb * 0.2, 1 + d.absorb * 0.15 - d.dead * 0.6, 1 + d.absorb * 0.2);
  P.ori.scale.setScalar(1 + d.absorb * 1.5 + d.bite * 0.8);
  // feet: the leading one reaches and spreads; a strike throws it at you
  for (let i = 0; i < 4; i++) {
    const lead = i === 0 ? 1 : 0, rear = i === 3 ? 1 : 0;
    const reach = lead * (ext * 0.5 + d.engulf * 0.6 + d.bite * 0.7) - rear * ext * 0.2;
    for (let k = 0; k < 3; k++) {
      const o = P['p' + i + '_' + k];
      o.rotation.set((k === 0 ? -reach * 0.25 : reach * 0.12) + Math.sin(t * 1.1 + i + k) * 0.05 + d.bite * (k ? 0.25 : -0.5), Math.sin(t * 0.7 + i * 2 + k) * 0.12, 0);
      const s = 1 + reach * 0.35 + (i === 1 || i === 2 ? go * 0.1 * Math.sin(cyc + i) : 0);
      o.scale.set(s, 1 - flat * 0.3, s);
    }
  }
  // blisters fill and burst
  for (let i = 0; i < 5; i++) {
    const u = ((t * 0.12 + hash(i, 3)) % 1);
    const s = u < 0.9 ? 0.4 + u * 1.0 : Math.max(0.05, 1.3 - (u - 0.9) * 13);
    P['pu' + i].scale.setScalar(s * (1 - d.dead));
  }
  K.kit.F.tint.value.set(1.2, 1.25, 0.8, 0.08 + d.absorb * 0.2 + Math.max(0, Math.sin(t * 2)) * 0.04);
}

function animateMass(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); filmPersonalize(K, v); }
  const seed = Math.floor(hashId(c.id, 9) * 1000);
  if (K.kit.m.hSeed !== seed || !(K.kit.m.hA as HumanRig | undefined)?.root.parent) attachHumans(K, seed);
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'gulp') { ud.ab = 1; playAt('arv_gulp', c, 1, 14, 0.6); playAt('bh_squelch', c, 0.9, 12, 0.7); }
    else if (f.key === 'split') { ud.sp = 0.01; playAt('gore_tear', c, 0.9, 16, 0.6); playAt('arv_squelch', c, 1, 16, 0.6); }
    else if (f.key === 'recoil') { ud.rc = 1; playAt('bh_gurgle', c, 0.9, 14, 0.9); }
    else if (f.key === 'slap') playAt('arv_squelch', c, 1, 12, 0.8);
  }
  if (ud.sp) { ud.sp = Math.min(1, ud.sp + dt / 2.2); if (ud.sp >= 1) ud.sp = 0; }
  ud.ab = Math.max(0, (ud.ab ?? 0) - dt * 0.12); ud.rc = Math.max(0, (ud.rc ?? 0) - dt * 0.8);
  const md = c.dead ? '' : n.md ?? '';
  const absorb = Math.max(ud.ab, md === 'eat' ? 0.8 : 0);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 0.5) : 0;
  ud.ph = (ud.ph ?? 0) + dt * (0.6 + c.speed * 5);
  ud.ms = (ud.ms ?? (n.ms ?? 1)) + ((n.ms ?? 1) - (ud.ms ?? 1)) * Math.min(1, dt * 0.5);
  const s = 0.62 + 0.3 * ud.ms;
  rig.root.scale.set(s, s, s);
  const ac = attackCurve(rig, c, t);
  poseMass(K, { t, dt, speed: c.dead ? 0 : c.speed, ph: ud.ph, seed: hashId(c.id, 2), absorb, engulf: md === 'hunt' ? 0.5 : 0, split: Math.sin(Math.PI * (ud.sp ?? 0)), recoil: ud.rc, dead: ud.dk, flinch: flinchOf(c), bite: Math.max(ac.wind * 0.6, ac.strike) });
  poseHumans(K, t, seed, { reach: md === 'hunt' ? 1 : 0, dead: ud.dk, absorb });
  for (const fm of films(K)) (fm.material as THREE.MeshLambertMaterial).opacity = 0.5 * (1 - ud.dk * 0.5);
  K.kit.F.fx.value.y += dt; K.kit.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.3;
  uprightDead(K, c);
  if (c.speed > 0.05 && c.visibleToLocal && (ud.sT ?? 0) < t) { ud.sT = t + 1.1; playAt(Math.random() < 0.5 ? 'bh_squelch' : 'drag_scrape', c, 0.35, 10, 0.6 + Math.random() * 0.2); }
  if (!c.dead && c.visibleToLocal && (ud.gT ?? 0) < t) { ud.gT = t + 4 + Math.random() * 5; playAt('bh_gurgle', c, 0.4, 10, 0.5 + Math.random() * 0.3); }
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal) {
    const d = dist(p, c);
    if (md === 'eat' && d < 10) thinkOnce(p, 'bm_eat', ['It flowed right over the body. You can see it inside now. Coming apart.', 'It is eating them. Slowly. From the outside in.'][Math.floor(t * 0.2) % 2], 60);
    else if (md === 'hunt' && d < 6) thinkOnce(p, 'bm_hunt', 'It is coming for me. It thinks I am food. MOVE.', 30);
    else if (d < 8) thinkOnce(p, 'bacteria_mass', ['There is a face in it. Just under the surface. Its mouth is open.', 'That arm is moving. The hand is moving. Is it still—', 'A heap of slime with people in it. One of them is curled up like it is asleep.'][Math.floor(t * 0.13) % 3], 80);
  }
}

// ------------------------------------------------------------------ host brain
const SPLIT_AT = 2.4;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
const sizeOf = (c: Creature) => 0.62 + 0.3 * (net(c).ms ?? 1);
/** host: take a larder in whole: remains props are gone, corpses are gone */
function absorbWhole(c: Creature, l: Larder): number {
  const z = zoneOf(c);
  if (l.obj) { if (z.objects.get(l.obj.uid)) { op('objRemove', { z: z.key, uid: l.obj.uid }); return 0.55; } return 0; }
  const o = l.cid ? CS().creatures.get(l.cid) : null;
  if (o && o.dead) { const k = 0.25 + Math.min(0.6, (o.radius ?? 0.4) * 0.6); o.butchered = true; CS().remove(o); return k; }
  return 0;
}
function victim(c: Creature): Player | null {
  // the living it leaves alone, unless they are dying on the floor, stand in it, or hurt it
  let best: Player | null = null, bd = 1e9;
  const anger = c.mem.anger as { pid: string; t: number } | undefined;
  for (const p of playersIn(c.zoneKey)) {
    if (p.body.dead) continue;
    const d = dist(p, c), dying = p.body.downed || p.body.health < 25;
    const angry = anger && anger.pid === p.id && anger.t > G.time;
    const inIt = d < sizeOf(c) * 1.05;
    if ((dying && d < 14) || (angry && d < 16) || inIt) if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function thinkMass(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c), cs = CS(), now = G.time;
  if (!m.init) { m.init = 1; n.ms = n.ms ?? (m.mass ?? rng.float(0.8, 1.6)); m.hunger = rng.float(0.5, 1); }
  m.mdT = (m.mdT ?? 0) + dt;
  m.hunger = Math.min(1, m.hunger + dt / 90);
  const S = sizeOf(c);
  c.radius = c.sp.radius * S;
  if (ev.hurt > 0) {
    if (c.targetId && G.players.has(c.targetId)) m.anger = { pid: c.targetId, t: now + 20 };
    if (ev.hurt > 8) fx(c, 'recoil');
    // big blows knock lumps off it: it shrinks
    n.ms = Math.max(0.5, (n.ms ?? 1) - ev.hurt / 220);
  }
  // fire: it pulls back from flame
  const fp = playersIn(c.zoneKey).find((p) => !p.body.dead && heldFlame(p) && dist(p, c) < 3.2);
  if (fp) { setMd(c, 'recoil'); const fs = cs.fleeSpot(c, z, fp.x, fp.z); cs.moveTo(c, z, fs.x, fs.z, c.sp.run, dt, 0.5); if (m.mdT < 0.1) { fx(c, 'recoil'); ruleShown(c); } return true; }
  // splitting: pinches in two over a couple of seconds
  if (n.md === 'split') {
    c.speed = 0; c.vx = c.vz = 0;
    if (m.mdT > 2.1) {
      const half = (n.ms ?? 2.4) / 2;
      n.ms = half;
      const a = c.facing + Math.PI / 2;
      const o = cs.spawn('bacteria_mass', c.zoneKey, c.x + Math.cos(a) * 0.9, c.z + Math.sin(a) * 0.9);
      if (o) { o.mem.mass = half; net(o).ms = half; o.facing = o.targetFacing = a; o.mem.init = 0; }
      setMd(c, '');
    }
    return true;
  }
  if ((n.ms ?? 1) >= SPLIT_AT) { setMd(c, 'split'); fx(c, 'split'); return true; }
  // eating: flowed over it, taking it in
  if (n.md === 'eat') {
    c.speed = 0; c.vx = c.vz = 0; c.setState('eat');
    if (m.mdT > 7) {
      const got = m.meal ? absorbWhole(c, m.meal) : 0;
      if (got) { n.ms = Math.min(2.6, (n.ms ?? 1) + got); m.hunger = Math.max(0, m.hunger - 0.6); fx(c, 'gulp'); }
      m.meal = null; setMd(c, '');
    }
    return true;
  }
  const vp = victim(c);
  if (vp) {
    const d = dist(vp, c);
    if (n.md !== 'hunt') { setMd(c, 'hunt'); if (d < 10) ruleShown(c); }
    c.setState('chase'); c.targetId = vp.id;
    cs.moveTo(c, z, vp.x, vp.z, vp.body.downed ? c.sp.walk * 1.2 : c.sp.run, dt, S * 0.8);
    if (d < c.sp.attack!.range * S + 0.4 && c.attackT <= 0) { faceTo(c, vp.x, vp.z); attack(c, vp); fx(c, 'slap'); }
    return true;
  }
  if (n.md === 'hunt' || n.md === 'recoil') setMd(c, '');
  // food: the dead, wherever they lie
  if (m.hunger > 0.25) {
    const l = larderNear(z, c.x, c.z, 16);
    if (l) {
      c.setState('travel');
      if (cs.moveTo(c, z, l.x, l.z, c.sp.walk, dt, S * 0.7)) { faceTo(c, l.x, l.z); m.meal = l; setMd(c, 'eat'); fx(c, 'gulp'); }
      return true;
    }
  }
  c.setState('wander');
  if (!m.goal || m.mdT > (m.wT ?? 12)) { m.goal = cs.wanderSpot(c, z, 7); m.wT = rng.float(10, 20); m.mdT = 0; }
  if (m.goal && cs.moveTo(c, z, m.goal.x, m.goal.z, c.sp.walk * 0.7, dt, 0.6)) { m.goal = null; c.speed = 0; }
  return true;
}

const MASS = def({
  key: 'bacteria_mass', name: 'Bacteria Mass', code: 'BM-02 // SWARM, BACTERIAL COLONY (NECROPHAGE)', temperament: 'neutral', threat: 3,
  rule: { name: 'IT EATS THE DEAD', text: 'It crawls to corpses and remains, flows over them and takes them in, and it grows; big enough, it splits in two. It leaves the living alone unless you stand in it, hurt it, or lie bleeding on the floor, which to it is the same as dead. It is slow: walk away. Fire drives it back. Blows knock lumps off it.', tell: 'A heap of slime crawling toward a body. There is a face in it.' },
  hp: 150, walk: 0.26, run: 0.55, turn: 1.6, radius: 0.85, height: 1.0, sight: 6, fov: 3.1, hearing: 0.8, smell: true, vibration: true,
  attack: { dmg: [6, 11], range: 1.25, cooldown: 2.2, kinds: ['burn'], corrupt: 0.05, knock: 0.3, parts: ['shin_l', 'shin_r', 'thigh_l', 'thigh_r', 'foot_l', 'foot_r', 'hand_l', 'hand_r'] },
  zones: ['undercroft', 'tunnels', 'hospital', 'parking'], weight: 1, group: [1, 1], maxPerZone: 3, diet: 'meat',
  sounds: { idle: 'bh_gurgle', alert: 'bh_gurgle', attack: 'arv_squelch', hurt: 'bh_squelch', death: 'gore_burst' },
  scan: {
    cls: 'Swarm / bacterial colony, necrophagous',
    notes: [
      'A crawling colony mat, a metre and a half across: gel, crusts of colonies, blisters.',
      'There are human bodies inside it, partly digested. One of them moves.',
      'It eats the dead (corpses, remains) and grows. Grown, it splits in two.',
      'It ignores the living unless hurt, stood in, or the unit is dying. Slow. Fire repels it.',
    ],
  },
  remains: 'decal_puddle',
  gore: { blood: 'pale', tint: 0xd0c890, flesh: 0xc8b878, sever: ['p0_1', 'p1_1', 'p2_1', 'p3_1'], gib: false },
  build: () => buildBacteriaMass(0), animate: animateMass, think: thinkMass,
});
(MASS as any).handlesSevered = true;
onPlayerHit('bacteria_mass', (p) => {
  // it is in your clothes, on your skin, and it holds
  if (Math.random() < 0.35) p.actions.set(new HeldAction(p, 0.9, 'kneel', 'Stuck in it', 0.15));
  bus.emit('think', p, ['It burns. It is ON me. In my clothes.', 'It sucked at my legs. Like standing in hot glue.', 'My skin is coming up in blisters where it touched.'][Math.floor(Math.random() * 3)]);
});
// dead, it lets go of everything in it
onKilled('bacteria_mass', (c) => { op('decal', { z: c.zoneKey, d: { x: c.x, z: c.z, w: 2.6, d: 2.4, rot: Math.random() * 6, tex: 'decal_puddle' } }); });

export type BacteriaPose = 'idle' | 'ooze' | 'absorb' | 'engulf' | 'split' | 'recoil' | 'dead';
/** animate a bacteria mass rig with no game running (call every frame with a running clock); 'split' loops every 3 s */
export function poseBacteriaMass(rig: KitRig, t: number, dt: number, pose: BacteriaPose = 'idle', o: { mass?: number; speed?: number; variant?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant) { kitPersonalize(rig, o.variant); filmPersonalize(rig, o.variant); }
  kitSync(rig);
  const ud = rig.kit.m as Record<string, number>;
  const speed = o.speed ?? (pose === 'ooze' || pose === 'engulf' ? 0.3 : 0);
  ud.ph = (ud.ph ?? 0) + dt * (0.6 + speed * 5);
  if (o.mass !== undefined) rig.root.scale.setScalar(0.62 + 0.3 * o.mass);
  const sp = pose === 'split' ? Math.sin(Math.PI * Math.min(1, (t % 3) / 2.2)) : 0;
  poseMass(rig, { t, dt, speed, ph: ud.ph, seed: 0.3, absorb: pose === 'absorb' ? 0.9 : 0, engulf: pose === 'engulf' ? 1 : 0, split: sp, recoil: pose === 'recoil' ? 0.6 + 0.4 * Math.sin(t * 6) : 0, dead: pose === 'dead' ? 1 : 0, flinch: 0, bite: pose === 'engulf' ? Math.max(0, Math.sin(t * 2)) : 0 });
  poseHumans(rig, t, (rig.kit.m.hSeed as number) ?? 1, { reach: pose === 'engulf' ? 1 : 0, dead: pose === 'dead' ? 1 : 0, absorb: pose === 'absorb' ? 1 : 0 });
  rig.kit.F.fx.value.y += dt;
}
MASS.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['idle', 'ooze', 'absorb', 'engulf', 'split'][Math.floor(t / 5) % 5]) as BacteriaPose;
  poseBacteriaMass(rig as KitRig, t, 1 / 60, q, { mass: u.get('mass') !== null ? Number(u.get('mass')) : undefined });
};
void Wt;
