import * as THREE from 'three';
import { def, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, stop, faceTo, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, live, lineOfSightB } from '../behaviors_b';
import { flinchOf, hash } from '../kit/humanoids';
import { HumanRig, SKIN_TONES, type Appearance, type Outfit, type Pose as HPose } from '../../entities/humanRig';
import { BONES, BONE_PARENT, type BoneName } from '../../entities/humanModel';
import type { AnimInput } from '../../entities/humanAnim';
import { worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { defDread } from '../dread';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE STALKER — Level 0's copy of you. It is the unit you are linked into, made
// again by the place from the outside, from watching: your face, your suit,
// your lamp, the way you walk, all of it a little wrong. It stands a head and
// a half too tall on legs that are too long; the left one is longer still and
// will not bend, so it drags it, toes down, behind the good one. Its arms hang
// past its knees. Its head is the wrong size for it (on some a little large, on
// some a little small); its eyes are too round and too pale and never quite
// look at the same thing; its face does not hold still: it flickers between
// smiles. It wants to be you. It walks where you walked and does what you did a
// few seconds late, and each thing it copies brings it closer. Look straight at
// it and it stops and copies you face to face. Now and then it does something
// you did not do and waits for you to copy it: do it, and it keeps its distance;
// don't, and it breaks into a limping, lurching run at you.
// The body is the one human base (HumanRig), dressed and painted from the unit
// watching it, its bones re-posed by the human animator (the walk, the crouch,
// the hands picking things up are the real ones) and then stretched by our own
// forward kinematics (each bone's matrix set directly, no shear).
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildStalker()                                -> StalkerRig (rig.root into any scene; rig.hr is the HumanRig)
//   poseStalker(rig, t, dt, pose, { speed, lookYaw, move, look? })
//     pose: 'idle' | 'walk' | 'copy' | 'crouch' | 'watch' | 'pickup' | 'lamp' | 'still' | 'lunge' | 'dead'
//   dressStalker(rig, app, outfit)               -> the copy of a given person
// =====================================================================================

type V3 = [number, number, number];
const ONE: V3 = [1, 1, 1];
/** too long everywhere; the left leg (the dragged one) longer still */
const STRETCH: Partial<Record<BoneName, V3>> = {
  hips: [0.96, 1, 0.94], spine: [0.92, 1.24, 0.9], chest: [0.96, 1.1, 0.92], neck: [0.8, 1.7, 0.8],
  uarmL: [0.88, 1.36, 0.88], uarmR: [0.88, 1.36, 0.88], farmL: [0.86, 1.46, 0.86], farmR: [0.86, 1.46, 0.86], handL: [0.96, 1.32, 0.96], handR: [0.96, 1.32, 0.96],
  fing1L: [1, 1.4, 1], fing1R: [1, 1.4, 1], fing2L: [1, 1.5, 1], fing2R: [1, 1.5, 1], thumbL: [1, 1.2, 1], thumbR: [1, 1.2, 1],
  thighL: [0.9, 1.5, 0.9], shinL: [0.86, 1.5, 0.86], footL: [0.92, 1, 1.25],
  thighR: [0.92, 1.32, 0.92], shinR: [0.88, 1.34, 0.88], footR: [0.95, 1, 1.15],
};
/** the leg it walks on: how much longer than yours (gait speed is scaled down by this so the feet do not slide) */
const K_LEG = 1.33;

/** stand-in look for the gallery and before it has seen anyone: a debtor in the Remittance suit */
const DEFAULT_APP: Appearance = { skin: SKIN_TONES[1], hair: 0x3b2a1e, hairStyle: 'short', face: 2, build: 'average', height: 1, bodyShape: 0.25, facialHair: 'stubble', age: 0.3 };
const HAZMAT: Outfit = {
  torso: { tex: 'c_hazmat', color: 0xe8c428, sleeve: 'long', item: 'hazmat_suit' }, legs: { tex: 'c_hazmat', color: 0xe8c428, item: 'hazmat_suit' }, legsKind: 'pants',
  feet: { tex: 'c_hazmat', color: 0x1e201e, item: 'hazmat_suit' }, hands: { tex: 'c_hazmat', color: 0x222422, item: 'hazmat_suit' },
};

export interface StalkerRig extends Rig { hr: HumanRig; m: Record<string, any>; lamp: THREE.Group; lens: THREE.Mesh; who: string }
const POOL: StalkerRig[] = [];
function inScene(o: THREE.Object3D) { while (o.parent) o = o.parent; return !!(o as any).isScene; }

let LAMP_GEO: { body: THREE.BufferGeometry; lens: THREE.BufferGeometry } | null = null;
function lampGeo() {
  if (LAMP_GEO) return LAMP_GEO;
  // your helmet lamp, copied: a gunmetal can on a bent bracket, a frosted lens
  const mb = new ModelBuilder();
  mb.box(0, 0, -0.012, 0.006, 0.026, 0.028, 'metal_dark', { color: 0x3a3f44 });
  mb.box(0.012, 0.0, 0.004, 0.022, 0.022, 0.034, 'metal_dark', { color: 0x30353a });
  mb.box(0.012, 0.0, 0.022, 0.025, 0.025, 0.004, 'chrome', { color: 0xd8dce0 });
  const lb = new ModelBuilder();
  lb.box(0.012, 0.0, 0.025, 0.019, 0.019, 0.003, 'white', { color: 0xeaf6ff, emissive: 1.4 } as never);
  LAMP_GEO = { body: mb.build(), lens: lb.build() };
  return LAMP_GEO;
}

export function buildStalker(): StalkerRig {
  // each HumanRig owns a texture page: reuse a rig the manager has dropped
  const free = POOL.find((r) => !inScene(r.root));
  if (free) {
    free.root.position.set(0, 0, 0); free.root.rotation.set(0, 0, 0); free.root.scale.set(1, 1, 1); free.root.userData = {};
    free.body.position.set(0, 0, 0); free.body.rotation.set(0, 0, 0); free.body.quaternion.identity(); free.body.visible = true;
    free.m = { S: free.m.S };
    return free;
  }
  const hr = new HumanRig(DEFAULT_APP, worldMaterial({}));
  // the eyes: too round, too wide open
  hr.ggOverrides = { eyeW: 1.3, eyeH: 1.6 };
  hr.setOutfit({ ...HAZMAT, cond: { pale: 2, dirt: 1 } } as Outfit);
  (hr.skin as any).clone = () => new THREE.Group();
  hr.skin.frustumCulled = false;
  for (const b of BONES) hr.bones[b].matrixAutoUpdate = false;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(hr.root);
  const lamp = new THREE.Group();
  const G2 = lampGeo();
  lamp.add(new THREE.Mesh(G2.body, worldMaterial({})));
  const lens = new THREE.Mesh(G2.lens, worldMaterial({ unlit: true, outline: 0 } as any));
  lens.visible = false;
  lamp.add(lens);
  hr.bones.head.add(lamp);
  const r: StalkerRig = { root, body, parts: { ...hr.j }, headY: 2.3, hr, m: {}, lamp, lens, who: '' };
  POOL.push(r);
  return r;
}

/** dress a rig as a person (their face and body, their suit, a little wrong); cheap when nothing changed */
export function dressStalker(R: StalkerRig, app: Appearance, outfit: Outfit, key = '') {
  const k = key || JSON.stringify(app) + JSON.stringify([outfit.torso?.tex, outfit.torso?.color, outfit.legs?.color, outfit.head?.tex, outfit.eyes?.tex, outfit.back?.tex, outfit.feet?.tex]);
  if (R.who === k) return;
  R.who = k;
  // older than you, paler than you, eyes washed almost white
  const a: Appearance = { ...app, eyeColor: 0xc8cec6, age: Math.min(1, (app.age ?? 0.2) + 0.3), scars: 0 };
  const o: Outfit = { ...outfit, cond: { ...(outfit.cond || {}), pale: 2, dirt: Math.max(1, (outfit.cond as any)?.dirt ?? 0), expr: '', bleeding: undefined } as any };
  // it got the suit nearly right: the same yellow, the same number (almost), but no hood and no visor,
  // so the face is bare (it has not worked out what the hood is for)
  if (o.torso?.tex === 'c_hazmat') { o.torso = { ...o.torso, tex: 'c_jumpsuit', item: 'prison_jumpsuit' }; o.torsoOuter = undefined; }
  if (o.legs?.tex === 'c_hazmat') o.legs = { ...o.legs, tex: 'c_jumpsuit', item: 'prison_jumpsuit' };
  o.head = undefined; o.eyes = undefined;
  R.hr.outfit = o;
  R.hr.setAppearance(a);
  R.lamp.position.set(-0.098 * R.hr.s, 0.135 * R.hr.s, 0.035 * R.hr.s);
  R.lamp.rotation.set(0.12, -0.08, 0);
  R.lamp.scale.setScalar(R.hr.s * 1.15);
}
/** the unit it is copying, as this peer sees it: the one it is after, else whoever is watching */
function copyLook(R: StalkerRig, c: Creature) {
  const ud = R.m;
  if ((ud.lookT ?? -9) > c.animT && R.who) return;
  ud.lookT = c.animT + 2.5;
  const n = netOf(c);
  const p = ((n.tg && G.players?.get(n.tg)) || G.local) as Player | undefined;
  if (!p?.app || !p.rig) { if (!R.who) dressStalker(R, DEFAULT_APP, HAZMAT, 'default'); return; }
  dressStalker(R, p.app, p.rig.outfit || HAZMAT);
}

// ------------------------------------------------------------------ FK (model space = the HumanRig body's space, facing +z)
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _mi = new THREE.Matrix4();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
interface FK { P: Record<string, THREE.Vector3>; Q: Record<string, THREE.Quaternion>; M: Record<string, THREE.Matrix4> }
function fkOf(R: StalkerRig): FK {
  return (R.m.fk ??= { P: Object.fromEntries(BONES.map((b) => [b, new THREE.Vector3()])), Q: Object.fromEntries(BONES.map((b) => [b, new THREE.Quaternion()])), M: Object.fromEntries(BONES.map((b) => [b, new THREE.Matrix4()])) }) as FK;
}
function stretchOf(R: StalkerRig, seed: number): Record<string, V3> {
  if (R.m.S && R.m.Sseed === seed) return R.m.S;
  // the head: on some a size too big, on some a size too small, and never quite the right shape
  const big = hash(seed, 3) < 0.5;
  const S: Record<string, V3> = { ...STRETCH } as Record<string, V3>;
  S.head = big ? [1.12, 1.22, 1.08] : [0.84, 0.92, 0.86];
  R.m.S = S; R.m.Sseed = seed;
  return S;
}
function place(R: StalkerRig, F: FK, S: Record<string, V3>, b: BoneName, q: THREE.Quaternion, local: boolean) {
  const p = BONE_PARENT[b] as BoneName | '';
  const off = R.hr.dims.off[b];
  if (p) {
    const ps = S[p] ?? ONE;
    _v.set(off[0] * ps[0], off[1] * ps[1], off[2] * ps[2]).applyQuaternion(F.Q[p]);
    F.P[b].copy(F.P[p]).add(_v);
    if (local) F.Q[b].copy(F.Q[p]).multiply(q); else F.Q[b].copy(q);
  } else F.Q[b].copy(q);
  const s = S[b] ?? ONE;
  F.M[b].compose(F.P[b], F.Q[b], _s.set(s[0], s[1], s[2]));
}
function commit(R: StalkerRig, F: FK) {
  for (const b of BONES) {
    const o = R.hr.bones[b], p = BONE_PARENT[b] as BoneName | '';
    if (!p || o.parent !== R.hr.bones[p]) o.matrix.copy(F.M[b]);
    else o.matrix.copy(_mi.copy(F.M[p]).invert()).multiply(F.M[b]);
    o.matrixWorldNeedsUpdate = true;
  }
}
const eul = (r: number[] | undefined, out: THREE.Quaternion) => (r ? out.setFromEuler(_e.set(r[0], r[1], r[2], 'XYZ')) : out.identity());
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * (1 - Math.exp(-rate * dt)));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const add = (P: HPose, k: string, x = 0, y = 0, z = 0) => { const a = ((P as any)[k] ??= [0, 0, 0]) as number[]; a[0] += x; a[1] += y; a[2] += z; };
const set = (P: HPose, k: string, x = 0, y = 0, z = 0) => { (P as any)[k] = [x, y, z]; };

export interface StalkerDrive {
  t: number; dt: number; seed: number;
  /** what it is doing: '' | 'copy' | 'watch' | 'test' | 'lunge' | 'back' | 'flee' | 'roam' */
  md: string;
  /** the copied body: speed (m/s, real), stance, action anim and its clock, lamp */
  speed: number; stance: 'stand' | 'sneak'; action: string; actionT: number; actionDur: number; lamp: number;
  /** the test it is setting you ('crouch' | 'lamp' | 'still') */
  test: string;
  lyaw: number; lpitch: number; look: number;
  dead: number; flinch: number; strike: number;
}

/** pose one frame: the human animator's real gait and actions, then wrongness, then stretched FK */
function poseK(R: StalkerRig, d: StalkerDrive) {
  const ud = R.m as Record<string, any>, hr = R.hr, t = d.t, dt = Math.min(0.1, Math.max(0, d.dt));
  const S = stretchOf(R, d.seed);
  const F = fkOf(R);
  const alive = 1 - d.dead;
  const lunge = sm(ud, 'lg', d.md === 'lunge' ? 1 : 0, 5, dt);
  const still = sm(ud, 'still', d.md === 'test' && d.test === 'still' ? 1 : 0, 6, dt);
  const watch = sm(ud, 'wt', d.md === 'watch' || d.md === 'test' ? 1 : 0, 3, dt);
  // ---- the human animator (it limps on the left; the gait is slowed to the long legs' stride)
  const inp: AnimInput = {
    speed: d.dead ? 0 : d.speed / K_LEG, stance: d.stance, full: '', action: (d.dead ? '' : d.action) as any, actionT: d.actionT, actionDur: d.actionDur || 1,
    twoHanded: false, limp: 0.85, limpSide: 'L', tired: 0.3, panic: lunge * 0.3, cold: 0, aimPitch: 0, holdingLight: false, holding: false,
    lookYaw: 0, fidget: false, exhausted: 0,
  };
  const P = hr.anim.update(dt, inp) as HPose;
  // ---- its own wrongness, over the copied movement
  // stooped under its own height; the head hangs forward on the long neck, tilted
  add(P, 'spine', 0.12 + 0.14 * lunge, 0, 0);
  add(P, 'chest', 0.05 + 0.06 * lunge, 0, 0);
  const tiltSide = hash(d.seed, 7) < 0.5 ? 1 : -1;
  const tilt = sm(ud, 'tilt', (0.22 + 0.2 * watch) * tiltSide + Math.sin(t * 0.37 + d.seed * 9) * 0.06, 2.2, dt);
  // the hitch of the drag: the body drops onto the long leg and is hauled up again every stride
  const ph = (ud.ph = (ud.ph ?? 0) + dt * Math.min(6, d.speed * 2.6));
  const hitch = Math.min(1, d.speed / 1.2) * alive;
  add(P, 'hips', 0, 0.06 * Math.sin(ph) * hitch, 0.07 * hitch + 0.05 * Math.sin(ph) * hitch);
  add(P, 'chest', 0, -0.05 * Math.sin(ph) * hitch, -0.06 * hitch);
  // a jerk now and then: the head snaps out of true and creeps back (it is not quite running you right)
  if ((ud.jkN ?? 0) < t) {
    ud.jkN = t + 0.5 + hash(Math.floor(t * 3.1), d.seed) * (watch > 0.5 ? 1.0 : 2.2);
    ud.jk0 = t; ud.jkA = [(hash(t, 1) - 0.5) * 0.5, (hash(t, 2) - 0.5) * 0.7, (hash(t, 3) - 0.5) * 0.6];
    ud.jkH = 0.08 + hash(t, 4) * 0.5;
  }
  const ju = t - (ud.jk0 ?? -9);
  const jk = ju < 0.04 ? ju / 0.04 : ju < 0.04 + (ud.jkH ?? 0) ? 1 : Math.max(0, 1 - (ju - 0.04 - (ud.jkH ?? 0)) / 0.3);
  const J = (ud.jkA ?? [0, 0, 0]) as number[];
  // it looks at you
  const ly = clamp(d.lyaw, -1.2, 1.2) * d.look * alive, lp = clamp(d.lpitch, -0.8, 0.6) * d.look * alive;
  // (in the lunge the head comes up to keep you in sight over the stoop)
  // (chin up, looking down its nose at you: the face stays turned up to the light)
  add(P, 'neck', 0.12 - 0.45 * lunge - lp * 0.2 + J[0] * jk * 0.4, ly * 0.5 + J[1] * jk * 0.3, tilt * 0.5 + J[2] * jk * 0.4);
  add(P, 'head', -0.3 - 0.3 * lunge - lp * 0.15 + J[0] * jk * 0.6, ly * 0.45 + J[1] * jk * 0.7, tilt * 0.7 + J[2] * jk);
  // arms: too long and too slack; reaching out in the lunge; palms up and out while it waits for you to stop
  if (lunge > 0.01) {
    for (const [s, k] of [['L', 1], ['R', -1]] as const) {
      const ua = (P as any)['uarm' + s] as number[] | undefined, fa = (P as any)['farm' + s] as number[] | undefined;
      const L = (x: number, y: number) => x + (y - x) * lunge;
      const sw = Math.sin(t * 9 + k * 1.3) * 0.12;
      (P as any)['uarm' + s] = [L(ua?.[0] ?? 0, -1.2 + sw), L(ua?.[1] ?? 0, 0), L(ua?.[2] ?? 0, k * 0.22)];
      (P as any)['farm' + s] = [L(fa?.[0] ?? 0, -0.25), L(fa?.[1] ?? 0, 0), L(fa?.[2] ?? 0, 0)];
    }
    P.gripL = (P.gripL ?? 0.3) * (1 - lunge) + 0.05 * lunge; P.gripR = (P.gripR ?? 0.3) * (1 - lunge) + 0.05 * lunge;
  }
  if (still > 0.01) {
    for (const [s, k] of [['L', 1], ['R', -1]] as const) {
      const ua = (P as any)['uarm' + s] as number[] | undefined;
      const L = (x: number, y: number) => x + (y - x) * still;
      (P as any)['uarm' + s] = [L(ua?.[0] ?? 0, -0.35), L(ua?.[1] ?? 0, 0), L(ua?.[2] ?? 0, k * 0.55)];
      add(P, 'farm' + s, -0.3 * still, 0, 0);
      add(P, 'hand' + s, 0, k * 0.9 * still, 0);
    }
    P.gripL = 0; P.gripR = 0;
  }
  if (d.dead > 0) {
    // slack: knees going, head dropped, arms dead (the manager topples the body)
    const k = d.dead;
    add(P, 'head', 0.6 * k, 0, 0.3 * k); add(P, 'neck', 0.3 * k, 0, 0);
    add(P, 'thighR', -0.3 * k, 0, 0); add(P, 'shinR', 0.6 * k, 0, 0);
    P.gripL = 0.4; P.gripR = 0.4;
  }
  // ---- stretched FK
  const sole = (hr as any).sole ?? 0;
  const ank = hr.dims.rest.footR[1];
  const baseHip = hr.dims.hipY + sole + (P.rootY ?? 0);
  F.P.hips.set((P.rootX ?? 0) * K_LEG, ank + (baseHip - ank) * K_LEG - 0.04 * lunge, (P.rootZ ?? 0) * K_LEG);
  place(R, F, S, 'hips', eul(P.hips, _q), false);
  for (const b of ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighR', 'shinR', 'footR'] as BoneName[]) place(R, F, S, b, eul((P as any)[b], _q), true);
  // ---- the dragged leg: too long to stand on, knee locked, trailing back on the tops of its toes
  place(R, F, S, 'thighL', _q.identity(), true);
  const H = F.P.thighL;
  const off = hr.dims.off;
  const Lt = Math.abs(off.shinL[1]) * (S.thighL ?? ONE)[1], Ls = Math.abs(off.footL[1]) * (S.shinL ?? ONE)[1];
  const knee = 0.08 + 0.1 * (d.stance === 'sneak' ? 1 : 0);
  // the straight-ish leg reaches the floor at this angle back from plumb
  const reach = Lt + Ls * Math.cos(knee);
  const ankY = 0.07 * hr.s;
  const aBack = Math.acos(clamp((H.y - ankY) / reach, -1, 1));
  const sway = Math.sin(ph) * 0.08 * hitch;
  if (d.dead < 0.5) {
    _qa.setFromEuler(_e.set(aBack + sway, 0.18, 0.1 + 0.04 * Math.sin(ph * 0.5), 'YXZ'));
    place(R, F, S, 'thighL', _qa, false);
    place(R, F, S, 'shinL', _qb.setFromEuler(_e.set(knee, 0, 0, 'XYZ')), true);
    // the foot turned in and over: it drags on the tops of its toes
    place(R, F, S, 'footL', _qc.setFromEuler(_e.set(1.15 - 0.25 * Math.sin(ph) * hitch, -0.3, 0.15, 'XYZ')), true);
  } else {
    place(R, F, S, 'thighL', eul((P as any).thighL, _q), true);
    place(R, F, S, 'shinL', eul((P as any).shinL, _q), true);
    place(R, F, S, 'footL', eul((P as any).footL, _q), true);
  }
  // fingers (the animator's grip), the lids
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const g = clamp((s === 'L' ? P.gripL : P.gripR) ?? 0.3, 0, 1);
    // the long fingers twitch on their own
    const tw = Math.pow(Math.max(0, Math.sin(t * 2.7 + k * 2 + d.seed * 5)), 12) * 0.5 * alive;
    const gg = clamp(g + tw, 0, 1);
    place(R, F, S, ('fing1' + s) as BoneName, _q.setFromEuler(_e.set(0, 0, -k * gg * 1.45)), true);
    place(R, F, S, ('fing2' + s) as BoneName, _q.setFromEuler(_e.set(0, 0, -k * gg * 1.6)), true);
    place(R, F, S, ('thumb' + s) as BoneName, _q.setFromEuler(_e.set(gg * 0.5, k * gg * 0.6, -k * gg * 0.55)), true);
  }
  place(R, F, S, 'lids', _q.identity(), true);
  commit(R, F);
  hr.body.rotation.set(P.bodyPitch ?? 0, P.bodyYaw ?? 0, P.bodyRoll ?? 0);
  hr.body.position.y = (P.bodyY ?? 0) * K_LEG;
  // ---- the face: it will not hold still. A smile, mostly; then something else for a frame or two
  const base = d.dead > 0.5 ? 'dead' : lunge > 0.5 ? 'happy' : d.md === 'test' ? 'smile' : watch > 0.5 ? 'neutral' : 'smile';
  if ((ud.exN ?? 0) < t) {
    const r = hash(Math.floor(t * 13.7), d.seed + 2);
    const flick = alive > 0.5 && r < (watch > 0.5 ? 0.5 : 0.3);
    ud.exShow = flick ? ['surprised', 'grin', 'sad', 'neutral', 'fear', 'happy'][Math.floor(hash(t, d.seed) * 6)] : base;
    ud.exN = t + (flick ? 0.05 + r * 0.12 : 0.25 + hash(t, 9) * 0.9);
  }
  const ex = d.dead > 0.5 ? 'dead' : (ud.exShow as string) || base;
  if (ud.ex !== ex) { ud.ex = ex; hr.setExpression(ex); }
  // the eyes do not agree with the head: they look at you, then somewhere else, then back
  const dart = alive > 0.5 && hash(Math.floor(t * 5.3), d.seed + 4) < 0.18;
  hr.lookEyes(dart ? (hash(t, 5) - 0.5) * 4 : clamp(-d.lyaw * 2.5, -2, 2), dart ? hash(t, 6) * 2 - 0.5 : lp < -0.2 ? 1 : 0);
  hr.faceTick(dt);
  // ---- your lamp, on its head
  const on = d.lamp > 0.5 && alive > 0.5;
  R.lens.visible = on;
}

// ------------------------------------------------------------------ in-game animation
function animateStalker(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as StalkerRig;
  const n = netOf(c), ud = R.m as Record<string, any>, seed = hashId(c.id, 11);
  copyLook(R, c);
  if (n.ac !== ud.acK) { ud.acK = n.ac; ud.acT = n.at ?? 0; } else ud.acT = (ud.acT ?? 0) + dt;
  // where it looks: at the unit watching, or the one it copies
  let lyaw = 0, lpitch = 0, look = 0;
  const tg = (n.tg ? G.players?.get(n.tg) : null) || (live() ? G.local : null);
  if (tg && tg.zoneKey === c.zoneKey && !c.dead) {
    const dx = tg.x - c.x, dz = tg.z - c.z, dd = Math.hypot(dx, dz);
    if (dd < 22) {
      let rel = Math.atan2(dz, dx) - c.facing; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
      lyaw = -rel; lpitch = Math.atan2(1.5 - 2.2, Math.max(0.6, dd));
      look = n.md === 'watch' || n.md === 'test' || n.md === 'lunge' || dd < 6 ? 1 : 0.55;
    }
  }
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 2) : 0;
  poseK(R, {
    t, dt, seed, md: c.dead ? '' : (n.md ?? ''), speed: c.dead ? 0 : c.speed, stance: n.st === 'sneak' ? 'sneak' : 'stand',
    action: n.ac || '', actionT: ud.acT, actionDur: n.ad || 1, lamp: n.li ? 1 : 0, test: n.tk || '',
    lyaw, lpitch, look, dead: ease(ud.dk), flinch: flinchOf(c), strike: c.attackPhase > 0 ? 1 : 0,
  });
  R.hr.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.5;
  // your lamp lights the floor in front of it
  if (n.li && !c.dead && live() && G.view?.zone?.key === c.zoneKey && c.visibleToLocal) {
    G.pointLight(c.x + Math.cos(c.facing) * 1.6, c.y + 0.5, c.z + Math.sin(c.facing) * 1.6, 0xe6f2ff, 0.9, 5);
  }
  // the dragged foot on the carpet, the good one stepping
  if (!c.dead && c.speed > 0.25 && live()) {
    ud.stp = (ud.stp ?? 0) + dt * c.speed;
    if (ud.stp > 0.9) {
      ud.stp = 0;
      const p = G.local;
      if (p && dist(p, c) < 18) { playAt('carpet_rustle', c, 0.35, 12, 0.55 + Math.random() * 0.1); setTimeout(() => playAt('step_carpet', c, 0.35, 12, 0.8), 220); }
    }
  }
  const f = fxPoll(rig, c);
  const p = localIn(c);
  if (f) {
    if (f.key === 'copy') { playAt('cloth', c, 0.4, 10, 0.8); if (Math.random() < 0.3) playAt('whisper', c, 0.25, 9, 0.7); }
    else if (f.key === 'spot') playAt('still_neck', c, 0.55, 16, 0.75);
    else if (f.key === 'test') { playAt('still_neck', c, 0.7, 14, 0.6); setTimeout(() => playAt('whisper', c, 0.4, 12, 0.6), 300); }
    else if (f.key === 'pleased') playAt('hollow_mutter', c, 0.45, 12, 0.8);
    else if (f.key === 'fail') { playAt('stammer_shriek', c, 0.9, 26, 0.7); playAt('dread_chase', c, 0.6, 26, 1); G.camera?.shake?.(0.15, 0.3); }
    else if (f.key === 'grab') playAt('dmg_grab', c, 1, 14, 0.8);
    if (p && f.key === 'test') {
      const k = f.a?.k as string;
      const line = k === 'crouch' ? 'It crouched. I didn\'t. It is waiting for me to do it too.'
        : k === 'lamp' ? (f.a?.on ? 'Its lamp just came on. Mine is off. It is waiting for me to match it.' : 'Its lamp went out. It is waiting for mine to go out too.')
          : 'It stopped dead with its hands out. It wants me to stop too.';
      bus.emit('think', p, line);
    }
    if (p && f.key === 'pleased') thinkOnce(p, 'stalker_ok', ['It smiled. My smile. It liked that.', 'It went back to copying me. It is still there.'][Math.floor(t) % 2], 25);
    if (p && f.key === 'fail') bus.emit('think', p, ['I didn\'t copy it. It is COMING—', 'It is running at me on that leg—'][Math.floor(t) % 2]);
  }
  if (p && !c.dead) {
    const dd = dist(p, c);
    if (n.md === 'watch' && dd < 16) thinkOnce(p, 'stalker_watch', ['It stops when I look at it. It is doing what I am doing.', 'That is my face. Too high up. Smiling.'][Math.floor(t * 0.2) % 2], 45);
    else if (n.md === 'copy' && dd < 20) thinkOnce(p, 'stalker_copy', ['It walks where I walked. It drags one leg the whole way.', 'It is wearing my suit. My lamp. It is a little closer every time I look back.', 'Someone is following me. They walk the way I walk.'][Math.floor(t * 0.13) % 3], 70);
  }
}

// ------------------------------------------------------------------ host brain
interface Sample { t: number; x: number; z: number; f: number; st: string; ac: string; at: number; ad: number; li: number; sp: number }
const D0 = 6, D_MIN = 1.3;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
/** can it see this unit (it needs to see you to copy you) */
function sees(c: Creature, p: Player): boolean {
  if (p.body.dead || p.zoneKey !== c.zoneKey) return false;
  const d = dist(p, c);
  if (d > 24) return false;
  if (!lineOfSightB(zoneOf(c), c.x, c.z, p.x, p.z)) return false;
  if (d < 7 || p.flashlightOn) return true;
  return (G.view?.zone?.key === c.zoneKey ? G.lightLevelAt(p.x, p.z) : 0.5) > 0.12;
}
function sampleOf(p: Player): Sample {
  let a: { ac: string; at: number; ad: number } = { ac: '', at: 0, ad: 0 };
  try { a = (p as any).netAnim?.() ?? a; } catch { /* remote */ }
  const ac = /^(pickup|loot|eat|drink|craft|hammer|saw|read|bandage|dig|pour|cough|wave|swing|swing2h|stab|shove|throw|scanner|type|pray|cover_ears|breathe|panic|emote:.*)$/.test(a.ac) ? a.ac : '';
  return { t: G.time, x: p.x, z: p.z, f: p.facing, st: p.stance === 'crawl' || p.stance === 'sneak' ? 'sneak' : 'stand', ac, at: a.at || 0, ad: a.ad || 1, li: p.flashlightOn ? 1 : 0, sp: p.speed };
}
/** where you were, what you were doing, at time tr (positions interpolated) */
function sampleAt(buf: Sample[], tr: number): Sample | null {
  if (!buf.length || tr < buf[0].t) return null;
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i].t <= tr) {
      const a = buf[i], b = buf[i + 1];
      if (!b) return a;
      const u = clamp((tr - a.t) / Math.max(1e-3, b.t - a.t), 0, 1);
      return { ...a, x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
    }
  }
  return buf[0];
}
function thinkStalker(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const md: string = n.md ?? '';
  if (!m.init) { m.init = 1; m.buf = []; m.D = D0; setMd(c, 'roam'); n.st = 'stand'; n.ac = ''; n.li = 0; }
  const buf = m.buf as Sample[];
  const p = n.tg ? G.players.get(n.tg) as Player | undefined : undefined;
  // ---- hurt: badly, it limps away; otherwise hitting it ends the game it was playing
  if (ev.hurt > 0) {
    if (c.hp < c.sp.hp * 0.35 && md !== 'flee') { setMd(c, 'flee'); m.goal = CS().fleeSpot(c, z, p?.x ?? c.x, p?.z ?? c.z); n.li = 0; return true; }
    if (md === 'roam' && c.targetId && G.players.has(c.targetId)) { n.tg = c.targetId; buf.length = 0; m.D = 3; setMd(c, 'lunge'); fx(c, 'fail'); return true; }
    if (md === 'copy' || md === 'watch' || md === 'test') { setMd(c, 'lunge'); fx(c, 'fail'); return true; }
  }
  if (md === 'flee') {
    c.setState('flee'); n.st = 'stand'; n.ac = '';
    if (!m.goal || CS().moveTo(c, z, m.goal.x, m.goal.z, c.sp.run * 0.8, dt, 1) || m.mdT > 9) { setMd(c, 'roam'); m.calm = G.time + 40; n.tg = null; buf.length = 0; }
    return true;
  }
  // ---- recording the unit it copies (only what it can see)
  if (p && p.zoneKey === c.zoneKey && !p.body.dead) {
    const vis = sees(c, p);
    if (vis) m.seenT = G.time;
    m.recT = (m.recT ?? 0) - dt;
    if (m.recT <= 0 && (vis || dist(p, c) < 6)) { m.recT = 0.1; buf.push(sampleOf(p)); if (buf.length > 420) buf.splice(0, buf.length - 420); }
  } else if (md !== 'roam') { setMd(c, 'roam'); n.tg = null; buf.length = 0; }
  // ---- lunge: the long leg hauled behind it, arms out, as fast as it can lurch
  if (md === 'lunge') {
    c.setState('chase'); n.st = 'stand'; n.ac = '';
    if (!p) { setMd(c, 'roam'); return true; }
    const d = dist(p, c), reach = (c.sp.attack?.range ?? 1.2) + p.radius;
    if (d <= reach && c.attackT <= 0) { attack(c, p); fx(c, 'grab'); m.hits = (m.hits ?? 0) + 1; setMd(c, 'back'); m.goal = null; return true; }
    CS().moveTo(c, z, p.x, p.z, c.sp.run, dt, reach * 0.8);
    if (d <= reach) faceTo(c, p.x, p.z);
    if (m.mdT > 6 || (G.time - (m.seenT ?? -99) > 3 && m.mdT > 2)) { setMd(c, 'back'); m.goal = null; }
    return true;
  }
  // ---- after a lunge: it backs off and starts copying again, further behind
  if (md === 'back') {
    c.setState('stalk');
    if (!p) { setMd(c, 'roam'); return true; }
    if (c.attackPhase > 0) { stop(c); return true; }
    if (!m.goal) m.goal = CS().fleeSpot(c, z, p.x, p.z);
    const done = CS().moveTo(c, z, m.goal.x, m.goal.z, c.sp.walk * 1.3, dt, 0.8);
    if (done || dist(p, c) > 7 || m.mdT > 3.5) { m.D = 5; buf.length = 0; buf.push(sampleOf(p)); setMd(c, 'copy'); m.testAt = G.time + rng.float(12, 18); }
    return true;
  }
  // ---- the test: it does something you did not, and waits for you to do it back
  if (md === 'test') {
    c.setState('watch'); stop(c);
    if (!p) { setMd(c, 'roam'); return true; }
    faceTo(c, p.x, p.z);
    const k = n.tk as string;
    let ok = false;
    if (k === 'crouch') { n.st = 'sneak'; ok = p.stance === 'sneak' || p.stance === 'crawl'; }
    else if (k === 'lamp') { n.st = 'stand'; ok = (p.flashlightOn ? 1 : 0) === n.li; }
    else { n.st = 'stand'; ok = p.speed < 0.15; }
    n.ac = '';
    m.okT = ok ? (m.okT ?? 0) + dt : 0;
    if (m.okT > (k === 'still' ? 1.2 : 0.35)) {
      fx(c, 'pleased'); m.D = Math.min(7, m.D + 1.4); m.testAt = G.time + rng.float(14, 22); setMd(c, 'copy'); m.okT = 0;
      for (const q of playersIn(c.zoneKey)) if (dist(q, c) < 20) { ruleShown(c); break; }
      return true;
    }
    if (m.mdT > 4.6) { fx(c, 'fail'); setMd(c, 'lunge'); for (const q of playersIn(c.zoneKey)) if (dist(q, c) < 20) { ruleShown(c); break; } }
    return true;
  }
  // ---- copying
  if (md === 'copy' || md === 'watch') {
    if (!p) { setMd(c, 'roam'); return true; }
    const d = dist(p, c);
    const vis = sees(c, p);
    // lost the trail: it walked to the end of what it saw and you were not there
    const last = buf[buf.length - 1];
    if (!vis && G.time - (m.seenT ?? -99) > 10 && (!last || G.time - m.D > last.t)) { setMd(c, 'roam'); n.tg = null; buf.length = 0; n.li = 0; m.calm = G.time + 8; return true; }
    // every second it watches you, the gap closes
    if (vis) m.D = Math.max(0, m.D - dt * 0.05);
    // close enough to touch, or caught all the way up: it stops copying
    if (m.D < D_MIN || d < 1.8) { fx(c, 'fail'); setMd(c, 'lunge'); return true; }
    // looked at: it stops and copies you face to face, now, not later
    if (c.observed && vis && d < 18) {
      if (md !== 'watch') setMd(c, 'watch');
      c.setState('watch'); stop(c); faceTo(c, p.x, p.z);
      const s = sampleOf(p);
      n.st = s.st; n.li = s.li; n.ac = s.ac; n.at = s.at; n.ad = s.ad;
      m.stare = (m.stare ?? 0) + dt;
      // stare it out too long and it sets you a test there and then
      if (m.stare > 7 && d < 12) { m.stare = 0; startTest(c, p); }
      return true;
    }
    if (md === 'watch') setMd(c, 'copy');
    m.stare = Math.max(0, (m.stare ?? 0) - dt * 0.5);
    c.setState('stalk');
    const s = sampleAt(buf, G.time - m.D) ?? buf[0];
    if (!s) { stop(c); faceTo(c, p.x, p.z); return true; }
    // walk where you walked: your pace, and faster while it is behind
    const gx = s.x, gz = s.z, gd = Math.hypot(gx - c.x, gz - c.z);
    const pace = Math.min(c.sp.run * 0.72, Math.max(s.sp * 1.05, gd > 0.6 ? Math.min(2.4, 0.6 + gd * 0.5) : 0));
    if (gd > 0.3 && pace > 0.05) CS().moveTo(c, z, gx, gz, pace, dt, 0.25);
    else { stop(c); c.targetFacing = s.f; }
    // and do what you did
    const key = s.st + '|' + s.ac + '|' + s.li;
    if (m.lastKey !== undefined && key !== m.lastKey) { m.D = Math.max(0, m.D - 0.35); fx(c, 'copy'); }
    m.lastKey = key;
    n.st = s.st; n.ac = s.ac; n.at = s.at + (G.time - m.D - s.t); n.ad = s.ad; n.li = s.li;
    // now and then it sets you a test
    if ((m.testAt ?? 0) < G.time && vis && d < 12 && d > 2.5) startTest(c, p);
    return true;
  }
  // ---- roaming: limping the halls, standing facing walls; it locks onto the first unit it sees
  c.setState('wander');
  n.st = 'stand'; n.ac = ''; n.li = 0;
  if (!(m.calm > G.time)) {
    let best: Player | null = null, bd = 99;
    for (const q of playersIn(c.zoneKey)) { if (!sees(c, q)) continue; const dd = dist(q, c); if (dd < bd) { bd = dd; best = q; } }
    if (best) {
      n.tg = best.id; buf.length = 0; buf.push(sampleOf(best)); m.D = D0; m.lastKey = undefined; m.testAt = G.time + rng.float(16, 24);
      setMd(c, 'copy'); fx(c, 'spot'); stop(c);
      return true;
    }
  }
  if (!m.goal || (m.goalT ?? 0) < G.time) { m.goal = CS().wanderSpot(c, z, 14); m.goalT = G.time + rng.float(10, 20); m.pause = 0; }
  if (m.pause > 0) { m.pause -= dt; stop(c); return true; }
  if (CS().moveTo(c, z, m.goal.x, m.goal.z, c.sp.walk, dt, 0.8)) { m.goal = null; m.pause = rng.float(3, 9); }
  return true;
}
function startTest(c: Creature, p: Player) {
  const m = c.mem, n = net(c);
  const opts: string[] = ['lamp'];
  if (p.stance !== 'sneak' && p.stance !== 'crawl') opts.push('crouch', 'crouch');
  if (p.speed > 0.4) opts.push('still', 'still');
  const k = rng.pick(opts);
  n.tk = k; m.okT = 0;
  if (k === 'lamp') n.li = p.flashlightOn ? 0 : 1;
  stop(c);
  setMd(c, 'test');
  fx(c, 'test', { k, on: n.li });
}

// ------------------------------------------------------------------ the species
const STALKER = def({
  key: 'stalker', name: 'Stalker', code: 'L0-81 // MIMIC, ELONGATED (UNIT COPY)', temperament: 'stalker', threat: 4,
  rule: {
    name: 'IT COPIES YOU',
    text: 'It walks where you walked and does what you did, a few seconds late, and every copy brings it a little closer. Look straight at it and it stops and copies you face to face. Now and then it does something you did not do (crouches, works its lamp, stops dead): do it back, quickly, and it keeps its distance. Don\'t, and it comes for you. It cannot follow a trail it did not see: put a door between you.',
    tell: 'Someone is following me. They walk the way I walk.',
  },
  hp: 150, walk: 0.9, run: 3.5, turn: 5, radius: 0.36, height: 2.35, sight: 24, fov: 2.4, hearing: 1.2,
  attack: { dmg: [14, 24], range: 1.25, cooldown: 2.4, kinds: ['laceration', 'bruise', 'deep'], corrupt: 0.03, knock: 0.6, grab: true, parts: ['neck', 'head', 'torso_u', 'uarm_l', 'uarm_r'] },
  zones: ['lobby'], weight: 0.3, group: [1, 1], maxPerZone: 1, diet: 'meat',
  disposition: { mood: 'predator', self: true },
  sounds: { idle: 'whisper', alert: 'still_neck', attack: 'dmg_grab', hurt: 'debtor_grunt', death: 'still_fall', step: 'carpet_rustle' },
  scan: {
    cls: 'Mimic / elongated copy of a unit',
    notes: [
      'A copy of the unit observing it: same face, same suit, same lamp. Two and a half metres tall.',
      'The left leg is longer than the right and does not bend; it is dragged.',
      'Follows the unit\'s exact route a few seconds behind, repeating its actions. The delay shortens.',
      'Sets tests: an action the unit did not perform. Failing to repeat it provokes a charge.',
    ],
  },
  gore: { blood: 'red', flesh: 0xb04048, gib: false },
  build: () => buildStalker(), animate: animateStalker, think: thinkStalker,
});
onPlayerHit('stalker', (p) => {
  bus.emit('think', p, ['Its hands are my hands. They are round my throat.', 'It has my face. It is so close. It is still smiling.', 'Its lamp is in my eyes— MY lamp—'][Math.floor(Math.random() * 3)]);
});
defDread('stalker', { stutter: 0.04, sting: 'swell', cam: 0.8, flick: 10 });

// ------------------------------------------------------------------ stand-alone posing (gallery, the video)
export type StalkerPose = 'idle' | 'walk' | 'copy' | 'crouch' | 'watch' | 'pickup' | 'lamp' | 'still' | 'lunge' | 'dead';
/**
 * Animate a Stalker rig with no game running: call every frame with a running clock.
 * Walking poses tread in place, or with { move: true } carry rig.root forward along its +z.
 */
export function poseStalker(rig: StalkerRig, t: number, dt: number, pose: StalkerPose = 'idle', o: { speed?: number; lookYaw?: number; move?: boolean; look?: number } = {}) {
  const ud = rig.m as Record<string, any>;
  if (!rig.who) dressStalker(rig, DEFAULT_APP, HAZMAT, 'default');
  const speeds: Partial<Record<StalkerPose, number>> = { walk: 0.9, copy: 1.3, lunge: 3.5 };
  const v = o.speed ?? speeds[pose] ?? 0;
  ud.vbz = (ud.vbz ?? 0) + v * Math.min(0.1, dt);
  if (o.move) rig.root.position.z = ud.vbz;
  ud.gT = pose === 'pickup' ? ((ud.gT ?? 0) + dt) % 2.2 : 0;
  poseK(rig, {
    t, dt, seed: 0.37, md: pose === 'watch' ? 'watch' : pose === 'still' ? 'test' : pose === 'lunge' ? 'lunge' : pose === 'copy' ? 'copy' : '',
    speed: v, stance: pose === 'crouch' ? 'sneak' : 'stand', action: pose === 'pickup' ? 'pickup' : '', actionT: ud.gT, actionDur: 2.2,
    lamp: pose === 'lamp' || pose === 'copy' ? 1 : 0, test: pose === 'still' ? 'still' : '',
    lyaw: o.lookYaw ?? 0, lpitch: -0.2, look: o.look ?? (pose === 'watch' || pose === 'still' || pose === 'lunge' ? 1 : 0.4),
    dead: pose === 'dead' ? 1 : 0, flinch: 0, strike: 0,
  });
}
STALKER.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['walk', 'watch', 'crouch', 'pickup', 'still', 'lunge'][Math.floor(t / 5) % 6]) as StalkerPose;
  poseStalker(rig as StalkerRig, t, 1 / 60, q, { lookYaw: u.get('ly') !== null ? Number(u.get('ly')) : undefined });
};
void STALKER;
