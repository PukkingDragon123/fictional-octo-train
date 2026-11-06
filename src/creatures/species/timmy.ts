import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig, creatureMaterial } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { op } from '../../game/ops';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { HumanRig, type Appearance, type Outfit, type Pose as HPose } from '../../entities/humanRig';
import { BONES, BONE_PARENT } from '../../entities/humanModel';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { CS, zoneOf, pulse, stop, faceTo, findSpot, onPlayerHit, onKilled, creatureMenu, poke, poked, floorItemsAround } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, walkable } from '../behaviors_b';
import { CutState, cutState, cutSync, cutRestore, flinchOf, clamp01 } from '../kit/humanoids';
import { hitPlayer, playersNear } from '../kit/oddkit';
import { blob, tube, surf, type V3 } from '../kit/anomalies';
import { KINDS, type BloodKind } from '../../gore/kinds';
import { itemDef } from '../../items/item';
import { createItem, serializeItem } from '../../items/factory';
import { ruleShown } from '../rules';

// =====================================================================================
// TIMMY: the Ball House kids. A child of five or six whose head has swollen to four
// times its size, the skin of it stretched thin and shiny as a balloon. The head
// floats; the little body dangles under it on a long stretched neck, socks and
// sneakers kicking at nothing a hand's breadth off the floor. Every one of them
// wears a too-small propeller beanie, a loud printed shirt, and holds a lollipop it
// licks to keep itself calm. They giggle, wave, follow you about and want to play.
// Stay close too long, hurt one, or let it get excited, and it gulps air between
// giggles until the head swells, reddens, squeaks and wobbles and then pops:
// confetti, candy and the rest of it, over everything near it. A sweet thrown near
// one (or given to it) calms it: it sucks, hums, forgets you.
//   timmy        the shared human base (src/entities/humanRig.ts HumanRig, its face and
//                paint pipeline): kid proportions by scale, the head bone inflated and
//                lifted on a stretched neck, the head's flush through the human shader's
//                fx.w; a propeller beanie and a lollipop hung on the bones; the body swings
//                under the floating head as a damped pendulum. Six kids (Appearance: face,
//                skin, hair, eyes, build, size; an all-over party-print shirt).
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildTimmy(variant 0..5)                         -> TimmyRig (rig.root into any scene)
//   poseTimmy(rig, t, dt, pose, { ch, speed, variant, look, ax, az })
//       pose: 'idle' | 'drift' | 'wave' | 'follow' | 'lick' | 'giggle' | 'beg' | 'eat' |
//             'charge' | 'hide' | 'rise' | 'deflate' | 'popped' | 'dead'
//       ch (0..1) drives the swelling for 'charge' (default: loops over 6.5 s)
//   timmyBurst(parent, at, power)                    -> (dt) => alive: a self-contained
//       confetti / candy / blood burst for staging the pop without the game
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
interface Kid {
  app: Appearance; outfit: Outfit;
  /** body scale (a child), head inflation, how far the head rides up its stretched neck (rig units) */
  rs: number; hs: number; lift: number;
  cap: [number, number, number, number]; brim: number; blades: [number, number]; pop: [number, number]; lazy?: boolean;
}
const kidOutfit = (shirt: number, tex: string, shorts: number, shoe: number): Outfit => ({
  torso: { tex, color: shirt, sleeve: 'short' }, legs: { tex: 'c_shorts', color: shorts }, legsKind: 'shorts', feet: { tex: 'c_shoes_sneaker', color: shoe },
});
/** the six kids (the Ball House never makes the same one twice in a row) */
export const KIDS: Kid[] = [
  { app: { skin: 0xf3d2b8, hair: 0x8a3a1c, hairStyle: 'short', face: 0, build: 'average', height: 1, bodyShape: 0.35, eyeColor: 0x3a6a9a, freckles: 0.9 },
    outfit: kidOutfit(0xffd22a, 'c_shirt_party', 0x2a5ac0, 0xd82a2a), rs: 0.6, hs: 3.1, lift: 0.15,
    cap: [0xe02a2a, 0xffd21a, 0x2a6ae0, 0x2aa84a], brim: 0x2a6ae0, blades: [0xe02a2a, 0xffd21a], pop: [0xff2a4a, 0xfff4f0] },
  { app: { skin: 0x8d5634, hair: 0x1c1612, hairStyle: 'curly', face: 1, build: 'heavy' as Appearance['build'], height: 0.96, bodyShape: 0.4, eyeColor: 0x3a2414 },
    outfit: kidOutfit(0x2ac8ea, 'c_shirt_party', 0xf07a1a, 0x2a9a3a), rs: 0.58, hs: 3.35, lift: 0.16,
    cap: [0x2a6ae0, 0xffd21a, 0xe02a2a, 0x2aa84a], brim: 0xe02a2a, blades: [0x2a6ae0, 0xffffff], pop: [0x3ad84a, 0xfff03a] },
  { app: { skin: 0xf6dcc8, hair: 0xd8c08a, hairStyle: 'ponytail', face: 2, build: 'slim', height: 1.06, bodyShape: 0.75, eyeColor: 0x6a7a3a, freckles: 0.2 },
    outfit: kidOutfit(0xff70bc, 'c_shirt_party', 0x6a8ad8, 0xf4f0f0), rs: 0.63, hs: 2.95, lift: 0.15,
    cap: [0xffd21a, 0xe02a2a, 0x2a6ae0, 0xe02a2a], brim: 0xffd21a, blades: [0xff70bc, 0xffffff], pop: [0xa04ae0, 0xfff4f0], lazy: true },
  { app: { skin: 0x5e3a24, hair: 0x1c1612, hairStyle: 'buzz', face: 3, build: 'average', height: 0.94, bodyShape: 0.3, eyeColor: 0x2a1a10 },
    outfit: kidOutfit(0x8ae02a, 'c_shirt_stripe', 0xc82a2a, 0x2a2a8a), rs: 0.54, hs: 3.0, lift: 0.15,
    cap: [0x2aa84a, 0xe02a2a, 0xffd21a, 0x2a6ae0], brim: 0xe02a2a, blades: [0xffd21a, 0x2aa84a], pop: [0x2a7aff, 0xfff4f0] },
  { app: { skin: 0xd39b6c, hair: 0x3b2a1e, hairStyle: 'short', face: 4, build: 'broad', height: 1.02, bodyShape: 0.3, eyeColor: 0x4a2a14, freckles: 0.4 },
    outfit: kidOutfit(0xe8321e, 'c_shirt_party', 0x3a3a4a, 0x1a1a1e), rs: 0.61, hs: 3.2, lift: 0.16,
    cap: [0x2a6ae0, 0xe02a2a, 0xffd21a, 0x2aa84a], brim: 0x2aa84a, blades: [0xe02a2a, 0xffffff], pop: [0xff8a1a, 0xffe8f0] },
  { app: { skin: 0xe8b98f, hair: 0x8a3a1c, hairStyle: 'bob', face: 5, build: 'heavy' as Appearance['build'], height: 0.96, bodyShape: 0.6, eyeColor: 0x6a8aa8, freckles: 0.5 },
    outfit: kidOutfit(0xff9a1a, 'c_shirt_party', 0x5aa8e8, 0xf0d21a), rs: 0.56, hs: 3.3, lift: 0.16,
    cap: [0xe02a2a, 0x2a6ae0, 0xffd21a, 0x2aa84a], brim: 0xffd21a, blades: [0x2aa84a, 0xffd21a], pop: [0xff5aa8, 0x8ae0ff] },
];
const NV = KIDS.length;
/** where its feet hang (m above the floor) */
const DANGLE = 0.3;
/** the crown of the head, in head-bone units (before the inflation) */
const CROWN = 0.325;
/** the balloon is wider than it is tall */
const HSX = 1.0, HSY = 1.04, HSZ = 1.0;

// ------------------------------------------------------------------ the things hung on the bones: the beanie and its propeller, the lollipop
function beanieGeo(K: Kid): THREE.BufferGeometry {
  const mb = new ModelBuilder(), r = 0.115, hgt = 0.1;
  // four panels of a dome
  for (let q = 0; q < 4; q++) {
    surf(mb, 4, 4, (i, j) => { const a = (q + i / 4) * Math.PI / 2 + Math.PI / 4, ph = (j / 4) * Math.PI / 2; return [Math.sin(a) * Math.cos(ph) * r, Math.sin(ph) * hgt, Math.cos(a) * Math.cos(ph) * r] as V3; },
      (i, j) => [i / 4, j / 4], 'white', { color: K.cap[q], inside: [0, -0.02, 0] });
  }
  // the band, the bill, the button and the stalk
  tube(mb, Array.from({ length: 17 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return [Math.sin(a) * r * 1.01, 0.006, Math.cos(a) * r * 1.01] as V3; }), 0.011, 5, 'white', { color: K.cap[3] });
  surf(mb, 6, 2, (i, j) => { const a = -0.9 + (i / 6) * 1.8, rr = r + (j / 2) * 0.075; return [Math.sin(a) * rr, 0.004 - (j / 2) * 0.022, Math.cos(a) * rr] as V3; }, (i, j) => [i / 6, j / 2], 'white', { color: K.brim, inside: null, flip: true });
  surf(mb, 6, 2, (i, j) => { const a = -0.9 + (i / 6) * 1.8, rr = r + (j / 2) * 0.075; return [Math.sin(a) * rr, 0.0 - (j / 2) * 0.022, Math.cos(a) * rr] as V3; }, (i, j) => [i / 6, j / 2], 'white', { color: K.brim, inside: null });
  mb.sphere(0, hgt, 0, 0.016, 6, 4, 'white', { color: K.cap[1] });
  mb.cylinder(0, hgt, 0, 0.005, 0.06, 5, 'metal_grey', { color: 0xd8d8e0 });
  return mb.build();
}
function propGeo(K: Kid): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.cylinder(0, -0.012, 0, 0.016, 0.022, 8, 'white', { color: K.cap[0] });
  for (const k of [1, -1]) {
    mb.push(); mb.rotateZ(k * 0.3);
    mb.box(k * 0.075, -0.002, 0, 0.13, 0.005, 0.034, 'white', { color: K.blades[k > 0 ? 0 : 1] });
    mb.pop();
  }
  return mb.build();
}
function popGeo(K: Kid): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.cylinder(0, -0.05, 0, 0.0045, 0.17, 6, 'white', { color: 0xf4f0e8 });
  mb.push(); mb.translate(0, 0.165, 0); mb.rotateX(Math.PI / 2);
  mb.cylinder(0, -0.008, 0, 0.06, 0.016, 16, { sides: 'white', top: 'i_bx_swirl', bottom: 'i_bx_swirl' }, { fit: true, color: mixHexS(K.pop[1], 0xffffff, 0.4) });
  mb.pop();
  blob(mb, [0, 0.165, 0], [0.062, 0.062, 0.008], 12, 4, 'white', { color: K.pop[0] });
  return mb.build();
}
const mixHexS = (a: number, b: number, t: number) => { const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255; return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t); };
const ATT = new Map<string, THREE.BufferGeometry>();
const attGeo = (k: string, v: number, fn: (K: Kid) => THREE.BufferGeometry) => { const key = k + v; let g = ATT.get(key); if (!g) { g = fn(KIDS[v]); ATT.set(key, g); } return g; };

// ------------------------------------------------------------------ the rig
export interface TimmyRig extends Rig {
  hr: HumanRig;
  /** the balloon's anchor (bobs), the pendulum the body swings on, the offset that hangs the rig from its head */
  float: THREE.Group; swing: THREE.Group; hold: THREE.Group;
  cap: THREE.Mesh; prop: THREE.Mesh; pop: THREE.Mesh;
  cut: CutState; kid: number; who: string; m: Record<string, any>;
  /** the head joint in rig space at rest (after the kid's scale), and the head bone's rest offset */
  piv: THREE.Vector3; head0: THREE.Vector3;
}
const POOL: TimmyRig[] = [];
const CUT_R: Record<string, number> = { head: 0.06, neck: 0.05, uarmL: 0.05, uarmR: 0.05, farmL: 0.042, farmR: 0.042, handL: 0.03, handR: 0.03, thighL: 0.075, thighR: 0.075, shinL: 0.055, shinR: 0.055, footL: 0.04, footR: 0.04 };
const capGeoC = new Map<number, THREE.BufferGeometry>();
function cutCap(name: string): THREE.Object3D | null {
  const r = CUT_R[name]; if (!r) return null;
  let g = capGeoC.get(r);
  if (!g) { const mb = new ModelBuilder(); mb.cylinder(0, -0.012, 0, r, 0.024, 8, { sides: 'gore_stump', top: 'gore_stump', bottom: 'gore_stump' }, { fit: true }); g = mb.build(); capGeoC.set(r, g); }
  const m = new THREE.Mesh(g, worldMaterial({})); m.name = 'kit_stump';
  return m;
}
function makeCut(hr: HumanRig): CutState { return cutState(BONES.map((b) => hr.bones[b]), hr.skin.skeleton, (i) => cutCap(BONES[i])); }

function newRig(v: number): TimmyRig {
  const K = KIDS[v];
  const hr = new HumanRig(K.app, worldMaterial({}), { hd: true });
  // the shared human base, its cranium ballooned out (src/entities/humanRig.ts inflateHead), wide child's eyes, flushed cheeks
  hr.ggOverrides = { inflate: 1, eyeW: 1.12, eyeH: 1.18, blush: 0.55 };
  hr.setOutfit(K.outfit);
  (hr.skin as any).clone = () => new THREE.Group();
  const root = new THREE.Group(), body = new THREE.Group(), float = new THREE.Group(), swing = new THREE.Group(), hold = new THREE.Group();
  root.add(body); body.add(float); float.add(swing); swing.add(hold); hold.add(hr.root);
  const mat = creatureMaterial();
  const cap = new THREE.Mesh(attGeo('cap', v, beanieGeo), mat), prop = new THREE.Mesh(attGeo('prop', v, propGeo), mat), pop = new THREE.Mesh(attGeo('pop', v, popGeo), mat);
  for (const m of [cap, prop, pop]) { m.castShadow = true; m.receiveShadow = true; (m as any).clone = () => m.clone(); }
  hr.j.head.add(cap); cap.add(prop); hr.j.handR.add(pop);
  const R: TimmyRig = { root, body, parts: { ...hr.j }, headY: 1.6, hr, float, swing, hold, cap, prop, pop, cut: makeCut(hr), kid: v, who: '', m: {}, piv: new THREE.Vector3(), head0: new THREE.Vector3() };
  fit(R);
  return R;
}
/** the kid's proportions: a child's body, the head inflated and riding up on a stretched neck; where the head hangs from */
function fit(R: TimmyRig) {
  const K = KIDS[R.kid], hr = R.hr;
  hr.root.scale.setScalar(K.rs);
  hr.applyPose({});
  R.head0.copy(hr.j.head.position);
  hr.j.head.position.y = R.head0.y + K.lift;
  hr.j.head.scale.set(K.hs * HSX, K.hs * HSY, K.hs * HSZ);
  const p = new THREE.Vector3();
  for (const b of ['hips', 'spine', 'chest', 'neck', 'head'] as const) p.add(hr.j[b].position);
  R.piv.copy(p.multiplyScalar(K.rs));
  R.hold.position.set(-R.piv.x, -R.piv.y, -R.piv.z);
  // the beanie perched on the crown at its real size; the propeller on its stalk; the lollipop in the fist
  const s = 1 / (K.rs * K.hs);
  R.cap.position.set(0, CROWN - 0.012, -0.012); R.cap.scale.setScalar(s); R.cap.rotation.set(-0.12, 0, 0);
  R.prop.position.set(0, 0.165, 0);
  R.pop.position.set(0, -0.075, 0.02); R.pop.scale.setScalar(1.7 / K.rs); R.pop.rotation.set(-Math.PI / 2, 0, 0);
  R.headY = R.piv.y + DANGLE + CROWN * K.hs * K.rs * 0.5;
}
/** dress a pooled rig as kid v */
function adopt(R: TimmyRig, v: number) {
  if (R.kid === v && R.who) return;
  const K = KIDS[v];
  R.kid = v;
  R.hr.setAppearance(K.app);
  R.hr.setOutfit(K.outfit);
  R.cut = makeCut(R.hr);
  R.parts = { ...R.hr.j };
  R.cap.geometry = attGeo('cap', v, beanieGeo); R.prop.geometry = attGeo('prop', v, propGeo); R.pop.geometry = attGeo('pop', v, popGeo);
  fit(R);
  R.who = 'kid' + v;
}
function tidy(R: TimmyRig) {
  cutRestore(R.cut, R.root, R.hr.body);
  for (const b of BONES) { const p = BONE_PARENT[b]; const want = p ? R.hr.bones[p] : R.hr.body; if (R.hr.bones[b].parent !== want) want.add(R.hr.bones[b]); }
  if (R.cap.parent !== R.hr.j.head) R.hr.j.head.add(R.cap);
  if (R.pop.parent !== R.hr.j.handR) R.hr.j.handR.add(R.pop);
  R.root.userData = {}; R.root.position.set(0, 0, 0); R.root.rotation.set(0, 0, 0); R.root.scale.set(1, 1, 1);
  R.body.rotation.set(0, 0, 0); R.body.position.set(0, 0, 0); R.body.visible = true;
  R.hr.j.head.visible = true; R.pop.visible = true;
  R.m = {};
}
function buildPooled(): Rig {
  for (const r of POOL) if (!r.root.parent) { tidy(r); return r; }
  const r = newRig(0); r.who = 'kid0';
  POOL.push(r);
  return r;
}
/** a Timmy rig (variant 0..5), not pooled: for staging, posters, the video */
export function buildTimmy(variant = 0): TimmyRig { const v = ((variant % NV) + NV) % NV; const r = newRig(v); r.who = 'kid' + v; return r; }

// ------------------------------------------------------------------ the pose
export interface TimmyDrive {
  t: number; dt: number;
  /** ground speed (m/s) and local acceleration (x left, z forward) of the floating body */
  speed: number; ax: number; az: number;
  /** mode: '' | 'wave' | 'follow' | 'beg' | 'candy' | 'eat' | 'charge' | 'hide' | 'rise' | 'lick' | 'giggle' */
  md: string;
  /** charge 0..1 (swelling), hidden in the balls 0..1, death 0..1, popped (head gone), deflated 0..1 */
  ch: number; hide: number; dead: number; popped: boolean; defl: number;
  flinch: number; seed: number;
  /** head yaw / pitch toward whoever it is looking at (radians, rig space) */
  look: [number, number];
}
const e3 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));

function poseT(R: TimmyRig, d: TimmyDrive) {
  const ud = R.m as Record<string, number>, t = d.t, dt = Math.min(0.05, Math.max(0, d.dt)), sd = d.seed * 13, K = KIDS[R.kid], hr = R.hr;
  const is = (m: string) => (d.md === m ? 1 : 0);
  const alive = 1 - d.dead;
  const mv = clamp01(d.speed / 1.2) * alive;
  const wave = sm(ud, 'wv', is('wave'), 5, dt), beg = sm(ud, 'bg', is('beg') + is('candy') * 0.4, 4, dt), eat = sm(ud, 'et', is('eat'), 5, dt);
  const chg = sm(ud, 'cg', is('charge'), 6, dt), lickM = sm(ud, 'lk', is('lick') + is('eat') * 0.5, 5, dt), fol = sm(ud, 'fl', is('follow') + is('beg') * 0.5, 3, dt);
  const ch = d.ch, c2 = ch * ch;
  const hide = sm(ud, 'hd', d.hide, d.hide > (ud.hd ?? 0) ? 1.6 : 3.2, dt);
  // ---- the balloon bobs; the body swings under it on its neck (a damped pendulum)
  const bob = ((Math.sin(t * 1.35 + sd) * 0.05 + Math.sin(t * 2.9 + sd * 2) * 0.018) * (1 - hide * 0.7) + Math.sin(t * 9 + sd) * 0.025 * c2) * alive;
  const bobV = Math.cos(t * 1.35 + sd) * 0.0675 * alive;
  const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / Math.max(1, n);
  const w2 = 15, damp = 1.6;
  let px = ud.px ?? 0, pv = ud.pv ?? 0, rz = ud.rz ?? 0, rv = ud.rv ?? 0;
  const drag = 0.08 * d.speed;
  for (let i = 0; i < n && h > 0; i++) {
    pv += (-w2 * (px - drag) - damp * pv + d.az / 0.6) * h; px += pv * h;
    rv += (-w2 * rz - damp * rv - d.ax / 0.6) * h; rz += rv * h;
  }
  if (d.dead < 0.5) { pv += Math.sin(t * 2.3 + sd) * 0.6 * dt * (0.3 + 2.5 * c2); rv += Math.sin(t * 3.1 + sd * 3) * 0.5 * dt * (0.2 + 3 * c2); }
  if (d.flinch > 0 && !ud.hitK) { ud.hitK = 1; pv += (Math.random() - 0.5) * 4; rv += (Math.random() - 0.5) * 4; ud.gig = 1; } else if (d.flinch <= 0) ud.hitK = 0;
  px = Math.max(-0.8, Math.min(0.8, px)) * alive; rz = Math.max(-0.8, Math.min(0.8, rz)) * alive;
  ud.px = px; ud.pv = pv * alive; ud.rz = rz; ud.rv = rv * alive;
  // ---- the head: inflated; swelling with the charge; squash, stretch and wobble; deflated when it dies unpopped
  const gig = ud.gig = Math.max(0, (ud.gig ?? 0) - dt * 1.4);
  const S = 1 + 0.72 * Math.pow(ch, 1.35);
  const wob = c2 * 0.075 * (1 + d.flinch), wf = 7 + 24 * ch;
  const stretch = bobV * 0.25 + gig * 0.05 * Math.sin(t * 34);
  const df = d.defl;
  const sx = K.hs * HSX * S * (1 + wob * Math.sin(t * wf + sd) - stretch * 0.5 + df * -0.35);
  const sy = K.hs * HSY * S * (1 + wob * Math.sin(t * wf * 1.13 + sd + 2) + stretch - df * 0.6);
  const sz = K.hs * HSZ * S * (1 + wob * Math.sin(t * wf * 0.91 + sd + 4) - stretch * 0.5 - df * 0.3);
  const head = hr.j.head;
  head.scale.set(Math.max(0.2, sx), Math.max(0.2, sy), Math.max(0.2, sz));
  head.position.set(R.head0.x, R.head0.y + K.lift * (1 + (S - 1) * 1.1) * (1 - df * 0.7), R.head0.z);
  // ---- the anchor: bobbing a hand's breadth up; sunk in the balls to its hat when it hides; on the floor when dead
  const crownW = CROWN * K.hs * K.rs * S;
  const hideDepth = R.piv.y + DANGLE - Math.max(0.1, 0.5 - crownW);
  R.float.position.set(0, R.piv.y + (DANGLE + bob) * alive - hide * hideDepth + 0.05 * chg * Math.sin(t * 11), 0);
  R.swing.rotation.set(px, 0, rz);
  // ---- the body under it
  const P: HPose = {};
  const lookYaw = d.look[0] * 0.55 * alive * (1 - chg * 0.5), lookPitch = d.look[1] * 0.4 * alive;
  P.spine = [-px * 0.15 + Math.sin(t * 2.3 + sd) * 0.06 * c2 * 3 + 0.1 * beg, 0, -rz * 0.15];
  P.chest = [-px * 0.2 + 0.08 * beg, Math.sin(t * 0.9 + sd) * 0.08 * alive, -rz * 0.25];
  P.neck = [-px * 0.3, 0, -rz * 0.3];
  // the head stays upright while the body swings under it (it is the balloon)
  P.head = [-(px * 0.35 + (P.spine[0] + P.chest[0] + P.neck[0])) - lookPitch + 0.1 * mv + wob * Math.sin(t * wf * 0.7) * 1.5 - 0.12 * eat + 0.1 * lickM + 0.15 * d.dead,
    lookYaw + Math.sin(t * 0.43 + sd) * 0.08 * alive * (1 - fol),
    -(rz * 0.35 + (P.spine[2] + P.chest[2] + P.neck[2])) + Math.sin(t * 0.61 + sd) * 0.06 * alive + (K.lazy ? 0.05 : 0) + gig * 0.08 * Math.sin(t * 21)];
  // legs: dangling, kicking at nothing; paddling when it drifts; thrashing when it charges
  const kickF = 2.2 + 3 * mv + 9 * chg, kickA = 0.22 + 0.25 * mv + 0.7 * chg * (0.4 + ch);
  for (const [s, k] of SIDES) {
    const ph = t * kickF + (k > 0 ? 0 : Math.PI) + sd;
    const kk = Math.sin(ph) * kickA * alive;
    P[('thigh' + s) as 'thighL'] = [(-0.3 - 0.35 * beg + kk) * alive - 0.15 * d.dead, 0, k * (0.06 + 0.05 * Math.sin(t * 1.3 + k)) * alive];
    P[('shin' + s) as 'shinL'] = [(0.45 + Math.max(0, -kk) * 1.1 + 0.25 * Math.sin(ph + 1.2) * (0.4 + chg)) * alive + 0.2 * d.dead, 0, 0];
    P[('foot' + s) as 'footL'] = [(0.6 + Math.sin(ph + 2) * 0.2) * alive, 0, 0];
  }
  // arms: the right holds the lollipop up (and to the mouth to lick); the left waves, begs, swings
  const lick = lickM * (0.5 + 0.5 * Math.sin(t * 3.2 + sd));
  const flail = chg * (0.5 + ch);
  P.uarmR = [(-0.5 - 0.55 * lick - 0.2 * beg + flail * 0.7 * Math.sin(t * 13 + sd)) * alive, 0.1, (-0.15 - flail * (0.9 + 0.6 * Math.sin(t * 11))) * alive - 0.6 * d.dead];
  P.farmR = [(-1.35 - 0.4 * lick + flail * 0.8 * Math.sin(t * 15)) * alive, 0, 0];
  P.handR = [0.1 * alive, 0.2 * lick, 0];
  const wv = Math.sin(t * 9.5 + sd);
  const swing = Math.sin(t * 1.6 + sd) * 0.18 * (1 - wave) * (1 - beg);
  P.uarmL = [(swing - 0.85 * beg - 0.15 * eat + flail * Math.sin(t * 12.5 + 1)) * alive, 0, (0.12 + 2.5 * wave + 0.25 * beg + flail * (1 + 0.6 * Math.sin(t * 10 + 2))) * alive + 0.6 * d.dead];
  P.farmL = [(-0.25 - 0.5 * beg - 1.1 * eat - 0.3 * wave) * alive, 0, (0.5 * wv * wave + 0.25 * wave) * alive];
  P.handL = [0.25 * beg * Math.sin(t * 6), 0.3 * wave * wv, 0.2 * wave];
  P.gripR = 0.85 * alive; P.gripL = (0.45 - 0.4 * wave - 0.3 * beg * (0.5 + 0.5 * Math.sin(t * 6))) * alive + 0.2;
  hr.applyPose(P);
  // ---- the face: a fixed grin; giggles; chewing; mouth stretched wide as it swells; eyes that follow you
  const want = d.dead ? 'dead' : chg > 0.5 ? (ch > 0.55 ? 'surprised' : 'grin') : eat > 0.5 ? 'happy' : (gig > 0.3 || is('giggle')) ? 'happy' : beg > 0.5 ? 'surprised' : 'grin';
  if (want !== (R.m.exprS as string | undefined)) { R.m.exprS = want; hr.setExpression(want); }
  if ((gig > 0.5 || eat > 0.5 || (chg > 0.5 && ch > 0.3)) && !ud.talkOn) { hr.talk(0.5); ud.talkOn = 1; } else if (gig <= 0.5 && eat <= 0.5) ud.talkOn = 0;
  hr.lookEyes(Math.max(-2, Math.min(2, d.look[0] * 2)) * alive + (K.lazy ? 0.6 * Math.sin(t * 0.4) : 0) + Math.sin(t * 3.7 + sd) * 0.4 * chg, Math.max(-1, Math.min(2, -d.look[1] * 2)) * alive);
  hr.faceTick(dt);
  // ---- the beanie stays the size it is (perched ever smaller on the swelling head); the propeller spins
  R.cap.scale.set(1 / (K.rs * Math.max(0.2, sx)), 1 / (K.rs * Math.max(0.2, sy)), 1 / (K.rs * Math.max(0.2, sz)));
  R.cap.rotation.set(-0.12 + Math.sin(t * 1.1 + sd) * 0.04 + wob * 2 * Math.sin(t * wf * 1.3), 0, rz * -0.1 + 0.04 * Math.sin(t * 0.8));
  const spin = (4.5 + 9 * mv + 70 * ch * chg + 6 * gig) * alive * (1 - hide * 0.7) + (d.dead > 0 && d.dead < 1 ? 3 : 0);
  ud.pa = ((ud.pa ?? sd) + dt * spin) % (Math.PI * 2);
  R.prop.rotation.set(0, ud.pa, 0);
  R.pop.visible = d.dead < 0.5;
  // ---- the flush: the head going red, veins standing out, as it fills (the human shader's fx.w)
  hr.fx.value.w = (0.9 * e3((ch - 0.12) / 0.8) + 0.12 * Math.max(0, Math.sin(t * (5 + 12 * ch))) * c2) * alive;
  // the head popped: gone (the gore system takes it; this keeps it gone everywhere)
  if (d.popped) head.visible = false;
}

// ------------------------------------------------------------------ stand-alone pose API
export type TimmyPose = 'idle' | 'drift' | 'wave' | 'follow' | 'lick' | 'giggle' | 'beg' | 'eat' | 'charge' | 'hide' | 'rise' | 'deflate' | 'popped' | 'dead';
/**
 * Animate a Timmy rig with no game running: call every frame with a running
 * clock. `ch` overrides the charge for 'charge' (default: swells over 6.5 s and
 * starts again); `variant` switches the kid; `look` aims the head and eyes.
 */
export function poseTimmy(rig: TimmyRig, t: number, dt: number, pose: TimmyPose = 'idle', o: { ch?: number; speed?: number; variant?: number; look?: [number, number]; ax?: number; az?: number } = {}) {
  if (o.variant !== undefined) adopt(rig, ((o.variant % NV) + NV) % NV);
  const ud = rig.m as Record<string, number>;
  if (rig.hr.j.head.visible === false && pose !== 'popped') rig.hr.j.head.visible = true;
  cutSync(rig.cut, rig.hr.body);
  const speed = o.speed ?? (pose === 'drift' || pose === 'follow' ? 0.9 : pose === 'charge' ? 1.4 : 0);
  const az = o.az ?? (speed > 0 ? Math.sin(t * 0.8) * 0.6 : 0), ax = o.ax ?? (speed > 0 ? Math.sin(t * 0.55) * 0.4 : 0);
  if (pose === 'giggle' && Math.floor(t / 2.2) !== ud.gk) { ud.gk = Math.floor(t / 2.2); ud.gig = 1; }
  const ch = pose === 'charge' ? (o.ch ?? Math.min(1, (t % 6.5) / 6)) : 0;
  const deadish = pose === 'popped' || pose === 'dead' || pose === 'deflate';
  if (!deadish) delete ud.dk0; else if (ud.dk0 === undefined) ud.dk0 = t;
  const dk = deadish ? Math.min(1, (t - ud.dk0) * 1.6) : 0;
  const md = pose === 'drift' || pose === 'idle' || deadish || pose === 'rise' ? '' : pose;
  const hide = pose === 'hide' ? 1 : pose === 'rise' ? Math.max(0, 1 - (t % 4) / 1.2) : 0;
  poseT(rig, {
    t, dt, speed, ax, az, md, ch, hide, dead: deadish ? e3(dk) : 0, popped: pose === 'popped', defl: pose === 'deflate' ? e3(dk) : 0,
    flinch: 0, seed: 0.37, look: o.look ?? [Math.sin(t * 0.3) * 0.4, 0.15],
  });
  // in the game the creature manager tips the dead over; standing alone, it falls on its side here
  rig.body.rotation.set(0, 0, deadish ? (Math.PI / 2) * e3(dk) : 0);
  rig.body.position.y = deadish ? 0.12 * e3(dk) : 0;
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
  const R = rig as TimmyRig;
  const v = Math.floor(hashId(c.id) * NV);
  if (R.who !== 'kid' + v) adopt(R, v);
  cutSync(R.cut, R.hr.body);
  const n = netOf(c), ud = R.m as Record<string, number>, seed = hashId(c.id, 7);
  rig.root.scale.setScalar(0.94 + hashId(c.id, 3) * 0.12);
  // the floating body's own acceleration in its local frame (the dangling body lags it)
  const vx = ud.qx === undefined ? 0 : (c.x - ud.qx) / Math.max(1e-3, dt), vz = ud.qz === undefined ? 0 : (c.z - ud.qz) / Math.max(1e-3, dt);
  ud.qx = c.x; ud.qz = c.z;
  const fwd = vx * Math.cos(c.facing) + vz * Math.sin(c.facing), lat = vx * Math.sin(c.facing) - vz * Math.cos(c.facing);
  const ax = Math.max(-20, Math.min(20, (lat - (ud.vl ?? lat)) / Math.max(1e-3, dt))), az = Math.max(-20, Math.min(20, (fwd - (ud.vf ?? fwd)) / Math.max(1e-3, dt)));
  ud.vl = lat; ud.vf = fwd;
  const ch = sm(ud, 'chs', n.ch ?? 0, 8, dt);
  const f = fxPoll(rig, c);
  const near = c.visibleToLocal || (!!G.local && G.local.zoneKey === c.zoneKey && Math.hypot(G.local.x - c.x, G.local.z - c.z) < 14);
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
      const wp = new THREE.Vector3(); R.hr.j.head.getWorldPosition(wp);
      if (!isFinite(wp.y) || wp.y < c.y + 0.3) wp.set(c.x, c.y + 1.4, c.z);
      wp.y += CROWN * KIDS[R.kid].hs * KIDS[R.kid].rs * 0.45;
      burstFx(wp.x, wp.y, wp.z, c.zoneKey, pw);
      playAt('tim_pop', c, 1, 40, 1.15 + Math.random() * 0.15); playAt('tim_splat', c, 1, 26, 0.9); playAt('gore_burst', c, 0.9, 24, 0.8);
      setTimeout(() => { if (G.local?.zoneKey === c.zoneKey) playAt('tim_squeak', c, 0.5, 14, 2.2); }, 120);
    }
  }
  // the charge's telegraph: squeaks of stretching rubber, faster and higher; mad giggles
  if (!c.dead && n.md === 'charge' && near && t > (ud.sqT ?? 0)) { ud.sqT = t + 0.6 - ch * 0.45 + Math.random() * 0.15; playAt('tim_squeak', c, 0.45 + ch * 0.5, 20, 0.75 + ch * 1.3); if (ch > 0.3 && Math.random() < 0.3) playAt('tim_stretch', c, 0.6, 16, 0.9 + ch * 0.4); }
  if (!c.dead && near && t > (ud.idleT ?? 0) && n.md !== 'charge' && n.md !== 'hide') { ud.idleT = t + 7 + Math.random() * 9; if (Math.random() < 0.55) { ud.gig = 1; playAt('tim_giggle', c, 0.5, 16, 1.4 + Math.random() * 0.4); } else playAt('tim_coo', c, 0.45, 10, 1.15 + Math.random() * 0.2); }
  const popped = !!n.pp || (c.dead && !!c.mem.sev?.includes?.('head'));
  // where it looks: the local survivor, when near enough
  let look: [number, number] = [0, 0.1];
  const p = localIn(c);
  if (p && !c.dead) {
    const a = Math.atan2(p.z - c.z, p.x - c.x); let rel = a - c.facing; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) < 2) look = [-rel, -Math.atan2(0.5, Math.max(0.5, dist(p, c)))];
  }
  const lk = ud.lkx === undefined ? look : [ud.lkx + (look[0] - ud.lkx) * Math.min(1, dt * 5), ud.lky + (look[1] - ud.lky) * Math.min(1, dt * 5)];
  ud.lkx = lk[0]; ud.lky = lk[1];
  // dead: it drops at once (the manager tips it over); deflated, the head sags as it goes
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 1.8) : 0;
  poseT(R, {
    t, dt, speed: c.speed, ax, az, md: c.dead ? '' : (n.md ?? ''), ch: c.dead ? 0 : ch, hide: c.dead ? 0 : (n.md === 'hide' ? 1 : 0),
    dead: c.dead ? 1 : 0, popped, defl: c.dead && !popped ? e3(ud.dk) : 0, flinch: flinchOf(c), seed, look: [lk[0], lk[1]],
  });
  R.hr.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.35;
  // what the unit makes of it
  if (p && !c.dead && c.visibleToLocal) {
    const dd = dist(p, c);
    if (n.md === 'charge' && dd < 16) thinkOnce(p, 'timmy_charge', ch < 0.5 ? 'Its head is swelling. It is going red and squeaking. Get away from it, or throw it something sweet.' : 'It is going to pop. GET AWAY FROM IT.', ch < 0.5 ? 14 : 8);
    else if (n.md === 'hide' && dd < 12) thinkOnce(p, 'timmy_hide', 'There is a little propeller turning in the balls. Just the hat, and the top of a head. Something is under there.', 70);
    else if (n.md === 'eat' && dd < 12) thinkOnce(p, 'timmy_eat', 'It took the sweet. It is sucking it and humming. It has forgotten all about me.', 50);
    else if (n.md === 'wave' && dd < 12) thinkOnce(p, 'timmy_wave', 'It is waving at me. It wants me to come and play.', 60);
    else if (n.md === 'follow' && dd < 6) thinkOnce(p, 'timmy_follow', ['It keeps following me. It giggles every time I look round.', 'It floats along behind me with its feet kicking. It wants to play.', 'Every time I stop, it stops. Every time I go, it goes.'][Math.floor(t * 0.07) % 3], 75);
    else if (dd < 9) thinkOnce(p, 'timmy', ['A little kid. A little kid with a head the size of a beach ball. It is floating.', 'Its head is skin. Stretched skin, shiny like a balloon. The hat is far too small for it.', 'It is licking a lollipop and looking at me.'][Math.floor(t * 0.11) % 3], 90);
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
  build: () => buildPooled(), animate: animateTimmy, think: thinkTimmy,
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
  poseTimmy(rig as TimmyRig, t, 1 / 60, q, { variant: num('v') ?? 0, ch: num('ch') });
};
horrify(TIMMY, { twitch: 0.2, snap: 0.12, breathe: 0, lunge: 0, flop: false, parts: /hand/ });
