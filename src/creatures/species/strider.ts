import * as THREE from 'three';
import { def, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { CS, zoneOf, pulse, attack, stop, faceTo, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, live, lineOfSightB } from '../behaviors_b';
import { attackCurve, flinchOf, hash } from '../kit/humanoids';
import { HumanRig, SKIN_TONES, type Appearance, type Outfit } from '../../entities/humanRig';
import { BONES, BONE_PARENT, type BoneName } from '../../entities/humanModel';
import { worldMaterial } from '../../gfx/materials';
import { defDread } from '../dread';
import { TEARS } from '../../gore/tearing';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE STRIDER — Level 0's tall walker. It was a person once: the Institute has
// matched one to a missing debtor by the healed break in its left collarbone.
// The place stretched it. It stands nearly four metres, most of it leg:
// long backward-jointed legs (a thigh, a shin, and a foot drawn out into a third
// limb that it walks on the tips of), a gaunt torso with every rib showing,
// arms that hang to its knees, and a small, slack, patient face. Its skin is
// smooth and stretched and sexless, striped with stretch marks, pale as the
// underside of a fish. It walks the yellow halls at the height of the ceiling
// tiles, stepping over the partitions. It listens for footsteps, stops, tilts
// its head, folds itself down to peer into rooms, and when it sees you it runs:
// four-metre strides, arms out. Its rule: it sees movement, not people. Get into
// a room and shut the door, or crouch and keep absolutely still.
// The body is the game's one human base (HumanRig: the same mesh, face and paint as
// every unit), its bones stretched (legs x3, arms x2.6, neck x2) and re-posed.
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildStrider(variant?)                          -> StriderRig (rig.root into any scene; rig.hr is the HumanRig)
//   poseStrider(rig, t, dt, pose, { speed, lookYaw, lookPitch, strikeT, move })
//     pose: 'idle' | 'walk' | 'stalk' | 'listen' | 'peer' | 'spot' | 'charge' | 'grab' | 'hold' | 'flee' | 'dead'
//   walking poses tread in place unless { move: true }, which carries rig.root forward
//   along its own +z at the walking speed (feet stay planted on the floor).
// =====================================================================================

// ------------------------------------------------------------------ the body: the shared human base (HumanRig), stretched
// One HumanRig (the same body, face and paint every human in the game uses), its bones driven by our own
// forward kinematics so each bone can be stretched along its own axes without shearing its children:
// every bone's matrix is set directly (matrixAutoUpdate off), as its parent's inverse times its own
// T(joint) * R(world) * S(stretch). The skin follows the bones as usual.
const STRETCH: Partial<Record<BoneName, [number, number, number]>> = {
  hips: [0.92, 1, 0.86], spine: [0.78, 1.55, 0.72], chest: [0.9, 1.18, 0.82], neck: [0.78, 2.1, 0.78], head: [0.82, 0.82, 0.82],
  uarmL: [0.82, 2.6, 0.82], uarmR: [0.82, 2.6, 0.82], farmL: [0.8, 2.75, 0.8], farmR: [0.8, 2.75, 0.8], handL: [1.0, 1.55, 1.0], handR: [1.0, 1.55, 1.0],
  fing1L: [1, 1.7, 1], fing1R: [1, 1.7, 1], fing2L: [1, 1.8, 1], fing2R: [1, 1.8, 1], thumbL: [1, 1.4, 1], thumbR: [1, 1.4, 1],
  thighL: [0.82, 3.1, 0.82], thighR: [0.82, 3.1, 0.82], shinL: [0.78, 3.15, 0.78], shinR: [0.78, 3.15, 0.78], footL: [0.9, 1.0, 3.3], footR: [0.9, 1.0, 3.3],
};
const ONE: [number, number, number] = [1, 1, 1];
const st = (b: BoneName) => STRETCH[b] ?? ONE;
/** who it was: a woman of about forty, pale, bald now; the same face the creator would give a unit */
const STRIDER_APP: Appearance = { skin: SKIN_TONES[0], hair: 0x1c1612, hairStyle: 'bald', face: 4, build: 'slim', height: 1, bodyShape: 0.55, eyeColor: 0, facialHair: 'none', freckles: 0.35, scars: 1, age: 0.55 };
/** naked: no top; the brief painted the colour of its skin (smooth, sexless); grey with pallor, grimed from the carpet */
// (the hands are stained from what it has caught)
const STRIDER_OUTFIT: Outfit = { torso: { tex: 'c_bare', color: SKIN_TONES[0] }, legs: { tex: 'c_underwear', color: 0xc8b8ac },
  cond: { pale: 3, dirt: 1, expr: '', blood: { hand_l: 1, hand_r: 2, farm_r: 1 } } };

export interface StriderRig extends Rig { hr: HumanRig; m: Record<string, any> }
/** the Strider's rig: a HumanRig (rig.hr) under rig.root, with stretched bones */
const POOL: StriderRig[] = [];
function inScene(o: THREE.Object3D) { while (o.parent) o = o.parent; return !!(o as any).isScene; }
export function buildStrider(_variant = 0): StriderRig {
  // each HumanRig owns a texture page: reuse a rig the manager has dropped
  const free = POOL.find((r) => !inScene(r.root));
  if (free) { free.root.position.set(0, 0, 0); free.root.rotation.set(0, 0, 0); free.root.userData = {}; free.body.position.set(0, 0, 0); free.body.rotation.set(0, 0, 0); free.body.visible = true; free.m = {}; return free; }
  const hr = new HumanRig(STRIDER_APP, worldMaterial({}));
  hr.setOutfit(STRIDER_OUTFIT);
  hr.setExpression('sleepy');
  (hr.skin as any).clone = () => new THREE.Group();
  hr.skin.frustumCulled = false;
  for (const b of BONES) hr.bones[b].matrixAutoUpdate = false;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(hr.root);
  const r: StriderRig = { root, body, parts: { ...hr.j }, headY: 3.7, hr, m: {} };
  POOL.push(r);
  return r;
}

// ------------------------------------------------------------------ FK (model space = the HumanRig body's space, facing +z)
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _mi = new THREE.Matrix4();
interface FK { P: Record<string, THREE.Vector3>; Q: Record<string, THREE.Quaternion>; M: Record<string, THREE.Matrix4> }
function fkOf(R: StriderRig): FK {
  return (R.m.fk ??= { P: Object.fromEntries(BONES.map((b) => [b, new THREE.Vector3()])), Q: Object.fromEntries(BONES.map((b) => [b, new THREE.Quaternion()])), M: Object.fromEntries(BONES.map((b) => [b, new THREE.Matrix4()])) }) as FK;
}
const eq = (x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ') => _q.setFromEuler(_e.set(x, y, z, order));
/** place bone b: its joint from the parent's (stretched) frame; world rotation `q` (or parent * local) */
function place(R: StriderRig, F: FK, b: BoneName, q: THREE.Quaternion, local: boolean) {
  const p = BONE_PARENT[b] as BoneName | '';
  const off = R.hr.dims.off[b];
  if (p) {
    const ps = st(p);
    _v.set(off[0] * ps[0], off[1] * ps[1], off[2] * ps[2]).applyQuaternion(F.Q[p]);
    F.P[b].copy(F.P[p]).add(_v);
    if (local) F.Q[b].copy(F.Q[p]).multiply(q); else F.Q[b].copy(q);
  } else F.Q[b].copy(q);
  const s = st(b);
  F.M[b].compose(F.P[b], F.Q[b], _s.set(s[0], s[1], s[2]));
}
/** write the bone matrices (each relative to its parent) */
function commit(R: StriderRig, F: FK) {
  for (const b of BONES) {
    const o = R.hr.bones[b], p = BONE_PARENT[b] as BoneName | '';
    if (!p || o.parent !== R.hr.bones[p]) o.matrix.copy(F.M[b]);
    else o.matrix.copy(_mi.copy(F.M[p]).invert()).multiply(F.M[b]);
    o.matrixWorldNeedsUpdate = true;
  }
}
/**
 * Planar two-bone IK in a limb's plane (rolled sideways about z): from joint H to the third joint C.
 * Returns the roll and the two segments' angles (from straight down, + toward +z). bend +1: the
 * middle joint goes forward (a knee), -1: back (an elbow).
 */
function ik2(H: THREE.Vector3, Cx: number, Cy: number, Cz: number, L1: number, L2: number, bend: number) {
  const dx = Cx - H.x, dy = H.y - Cy, dz = Cz - H.z;
  const roll = Math.atan2(dx, Math.max(0.05, dy));
  const down = Math.hypot(dy, dx) * (dy >= 0 ? 1 : -1);
  const d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(L1 + L2 - 1e-3, Math.hypot(down, dz)));
  const beta = Math.atan2(dz, down);
  const gam = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const a1 = beta + bend * gam;
  const a2 = Math.atan2(dz - L1 * Math.sin(a1), down - L1 * Math.cos(a1));
  return { roll, a1, a2 };
}
/** world rotation of a down-pointing bone at angle a (from down, + toward +z) in a plane rolled by r */
const downQ = (a: number, r: number, out: THREE.Quaternion) => out.setFromEuler(_e.set(-a, 0, r, 'ZXY'));
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();

// =====================================================================================
// motion
// =====================================================================================
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
interface Foot { x: number; z: number; fx: number; fz: number; u: number; lift: number; land: number }
export interface StriderDrive {
  t: number; dt: number; md: string; seed: number;
  /** body position, facing and velocity in the floor's frame (world) */
  bx: number; bz: number; f: number; vx: number; vz: number;
  lyaw: number; lpitch: number; look: number;
  /** seconds into a grab (-1 none); still holding something */ gT: number; hold: number;
  dead: number; flinch: number;
  /** does a step from (ax,az) to (bx,bz) cross a wall (then the foot goes up over it) */
  over?: (ax: number, az: number, bx: number, bz: number) => boolean;
  /** a foot came down (speed of the body then) */
  onStep?: (side: number, v: number, high: boolean) => void;
}
const GRAB_REACH = 0.45;
const SIDES2 = [['L', 1], ['R', -1]] as const;

function poseS(R: StriderRig, d: StriderDrive) {
  const ud = R.m as Record<string, any>, t = d.t, dt = Math.min(0.1, d.dt), s9 = d.seed * 9;
  const hr = R.hr, off = hr.dims.off;
  const F = fkOf(R);
  const is = (m: string) => (d.md === m ? 1 : 0);
  const alive = 1 - d.dead, dead = d.dead;
  const peer = sm(ud, 'peer', is('peer'), is('peer') ? 1.1 : 1.8, dt);
  const listen = sm(ud, 'lis', is('listen') + is('spot') * 0.6, 3, dt);
  const charge = sm(ud, 'chg', is('charge') + is('flee') * 0.7, 3, dt);
  const stalk = sm(ud, 'stk', is('stalk'), 2, dt);
  const gT = d.gT;
  const reach = gT >= 0 ? ease(gT / GRAB_REACH) : 0;
  const hold = sm(ud, 'hold', Math.max(d.hold, gT >= GRAB_REACH ? 1 : 0), 6, dt);
  const grab = sm(ud, 'grab', Math.max(reach, hold), 7, dt);
  const v = Math.hypot(d.vx, d.vz);
  // limb lengths (stretched)
  const L1 = Math.abs(off.shinL[1]) * st('thighL')[1], L2 = Math.abs(off.footL[1]) * st('shinL')[1];
  const A1 = Math.abs(off.farmL[1]) * st('uarmL')[1], A2 = Math.abs(off.handL[1]) * st('farmL')[1];
  const HAND = (Math.abs(off.fing1L[1]) + Math.abs(off.fing2L[1]) + 0.05) * st('handL')[1];
  // the toe tip in the foot's own (stretched) frame: forward along +z, a little below the ankle
  const TOE_Z = 0.17 * st('footL')[2], TOE_Y = -0.062;
  // ---- the feet: planted on the floor, each stepping when the body has gone on too far without it
  const ps = Math.PI / 2 - d.f, cs = Math.cos(ps), sn = Math.sin(ps);
  const toW = (mx: number, mz: number): [number, number] => [d.bx + mx * cs + mz * sn, d.bz - mx * sn + mz * cs];
  const toM = (wx: number, wz: number): [number, number] => { const dx = wx - d.bx, dz = wz - d.bz; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
  const homeZ = 0.15 - 0.3 * peer - 0.1 * grab + 0.25 * dead, homeX = 0.34 + 0.12 * peer + 0.06 * charge;
  let feet = ud.feet as Foot[] | undefined;
  if (!feet) feet = ud.feet = SIDES2.map(([, k]) => { const [x, z] = toW(k * homeX, homeZ); return { x, z, fx: x, fz: z, u: -1, lift: 0, land: 0 }; });
  const clk = (ud.clk = (ud.clk ?? 0) + dt);
  const Ts = Math.max(0.3, Math.min(0.75, 0.78 - v * 0.085));
  const lead = Math.min(1.3, v * Ts * 0.62 + (v > 0.1 ? 0.12 : 0));
  const trig = v < 0.1 ? 0.3 : Math.min(1.35, 0.5 + 0.15 * v);
  const vxn = v > 1e-3 ? d.vx / v : 0, vzn = v > 1e-3 ? d.vz / v : 0;
  SIDES2.forEach(([, k], i) => {
    const Ft = feet![i], O = feet![1 - i];
    const [hx, hz] = toW(k * homeX, homeZ);
    const tx = hx + vxn * lead, tz = hz + vzn * lead;
    if (Ft.u < 0) {
      const err = Math.hypot(Ft.x - hx, Ft.z - hz);
      if (alive > 0.5 && err > trig && (O.u < 0 || O.u > 0.72) && clk - (ud.lastStep ?? -9) > Ts * 0.35) {
        Ft.u = 0; Ft.fx = Ft.x; Ft.fz = Ft.z;
        const high = !!d.over && d.over(Ft.x, Ft.z, tx, tz);
        Ft.lift = high ? 2.95 : 0.35 + 0.12 * v + 0.15 * stalk;
        ud.lastStep = clk;
      }
    }
    if (Ft.u >= 0) {
      Ft.u = Math.min(1, Ft.u + dt / (Ft.lift > 2 ? Ts * 1.6 : Ts));
      if (Ft.u < 0.7) { ud['tx' + i] = tx; ud['tz' + i] = tz; }
      const e = ease(Ft.u);
      Ft.x = Ft.fx + ((ud['tx' + i] ?? tx) - Ft.fx) * e; Ft.z = Ft.fz + ((ud['tz' + i] ?? tz) - Ft.fz) * e;
      if (Ft.u >= 1) { Ft.u = -1; d.onStep?.(k, v, Ft.lift > 2); Ft.lift = 0; }
    }
    if (dead > 0.5) { const [x, z] = toW(k * homeX, homeZ); Ft.x = x; Ft.z = z; Ft.u = -1; }
  });
  // ---- the body: high and stooped at the ceiling line; folded right down to peer; leaning into a run
  const swingL = feet[0].u >= 0 ? Math.sin(Math.PI * feet[0].u) : 0, swingR = feet[1].u >= 0 ? Math.sin(Math.PI * feet[1].u) : 0;
  const spread = Math.hypot(feet[0].x - feet[1].x, feet[0].z - feet[1].z);
  const hy = sm(ud, 'hy', 2.78 - 0.12 * listen - 1.42 * peer - 0.42 * charge - 0.8 * grab * (1 - peer) - 0.22 * stalk - 1.9 * dead, peer > 0.5 || dead ? 1.4 : 3, dt);
  const bob = -Math.max(0, spread - 0.7) * 0.06 + (swingL + swingR) * 0.05 * (1 - peer);
  const br = Math.sin(t * 1.15 + s9) * alive;
  const sway = sm(ud, 'sway', (swingL - swingR) * -0.07, 6, dt);
  const acc = sm(ud, 'acc', (v - (ud.lv ?? v)) / Math.max(1e-3, dt), 3, dt); ud.lv = v;
  const lean = Math.max(-0.2, Math.min(0.3, acc * 0.05));
  const pp = 0.16 + 0.55 * peer + 0.25 * charge + 0.2 * grab + 0.1 * stalk + lean + 0.5 * dead;
  const bp = 0.1 + 0.38 * peer + 0.15 * charge + 0.15 * grab + 0.08 * stalk - 0.06 * listen + 0.5 * dead;
  const cp = 0.08 + 0.3 * peer + 0.1 * charge + 0.12 * grab - 0.05 * listen + 0.4 * dead;
  const torso = pp + bp + cp;
  F.P.hips.set(sway + Math.sin(t * 60) * 0.03 * d.flinch, hy + bob + br * 0.01, 0);
  place(R, F, 'hips', eq(pp, sway * 1.5, sway * 1.2), false);
  place(R, F, 'spine', eq(bp + br * 0.012, -sway * 1.2, -sway), true);
  place(R, F, 'chest', eq(cp - br * 0.018, -sway, 0), true);
  // ---- neck and head: it looks at you; the head tilts, birdlike, while it listens; held level while it peers
  const look = d.look * alive;
  const lyaw = Math.max(-1.3, Math.min(1.3, d.lyaw)) * look, lp = Math.max(-0.9, Math.min(0.7, d.lpitch)) * look;
  if (listen < 0.05) ud.tiltS = hash(Math.floor(t * 0.1), 3) < 0.5 ? 1 : -1;
  const tilt = sm(ud, 'tilt', listen * (0.55 + 0.1 * Math.sin(t * 0.7)) * (ud.tiltS ?? 1) + peer * 0.25 * Math.sin(t * 0.4 + s9), 2, dt);
  const scan = peer * (1 - look) * Math.sin(t * 0.55 + s9) * 0.7;
  place(R, F, 'neck', eq(-torso * 0.62 - lp * 0.45 + 0.25 * dead + 0.15 * listen, lyaw * 0.5 + scan * 0.6, tilt * 0.4), true);
  place(R, F, 'head', eq(-torso * 0.3 - lp * 0.5 + 0.05 * Math.sin(t * 0.5) * alive + 0.2 * dead, lyaw * 0.45 + scan * 0.4, tilt * 0.75), true);
  place(R, F, 'lids', _q.identity(), true);
  // ---- legs: three long segments (thigh, the knee forward, the shin down and back to a heel high in the
  // air, then the foot drawn out into a third limb down to the toes): IK to the planted / swinging feet
  SIDES2.forEach(([s, k], i) => {
    const Ft = feet![i];
    const th = ('thigh' + s) as BoneName, sh = ('shin' + s) as BoneName, fo = ('foot' + s) as BoneName;
    place(R, F, th, _q.identity(), true); // joint position first
    const H = F.P[th];
    const [mx, mz] = toM(Ft.x, Ft.z);
    const sw = Ft.u >= 0 ? Math.sin(Math.PI * Ft.u) : 0;
    const ty = 0.03 + (Ft.u >= 0 ? Ft.lift * Math.pow(sw, Ft.lift > 2 ? 0.6 : 0.75) : 0);
    // the foot's angle (from down, + toward its toes): steep while it stands on the tips, folded back as it lifts
    const a3 = 0.32 - 0.6 * sw - (Ft.lift > 2 ? 0.5 * sw : 0) + 0.45 * peer + 0.25 * grab * (1 - peer) + 0.6 * dead;
    const th3 = Math.PI / 2 - a3;
    const oy = TOE_Y * Math.cos(th3) - TOE_Z * Math.sin(th3), oz = TOE_Y * Math.sin(th3) + TOE_Z * Math.cos(th3);
    const sol = ik2(H, k * LX2 + (mx - k * LX2) * 0.85, ty - oy, mz - oz, L1, L2, 1);
    downQ(sol.a1, sol.roll, _qa); place(R, F, th, _qa, false);
    downQ(sol.a2, sol.roll, _qb); place(R, F, sh, _qb, false);
    _qc.setFromEuler(_e.set(th3, 0, sol.roll, 'ZXY')); place(R, F, fo, _qc, false);
  });
  // ---- arms: dangling and swinging slack; reaching out in the run; planted on the floor to peer; snatching for a grab
  const legPh = (feet[0].u >= 0 ? feet[0].u : 0) - (feet[1].u >= 0 ? feet[1].u : 0);
  SIDES2.forEach(([s, k]) => {
    const ua = ('uarm' + s) as BoneName, fa = ('farm' + s) as BoneName, ha = ('hand' + s) as BoneName;
    place(R, F, ua, _q.identity(), true);
    const S = F.P[ua];
    const swing = sm(ud, 'asw' + s, -k * legPh * 0.35 * Math.min(1, v) - lean * 0.6, 2.5, dt);
    // FK: hang plumb from the shoulder whatever the torso is doing (a pendulum, lagging the body)
    let a1 = swing + Math.sin(t * 0.8 + k + s9) * 0.04 * alive, a2 = a1 + 0.22 + 0.1 * Math.abs(swing), a3 = a2 + 0.1, roll = k * (0.07 + 0.04 * Math.sin(t * 0.6 + k));
    if (dead > 0.5) { a1 = -0.2; a2 = 0.6; a3 = 0.9; roll = k * 0.5; }
    // IK targets (model space) for the finger tips
    let ikW = 0, T = [0, 0, 0], e3 = 0.4;
    if (peer > 0.01) { ikW = peer; T = [k * 0.62, 0.05, 1.15 - 0.15 * k * Math.sin(t * 0.3)]; e3 = 1.2; }
    if (charge > 0.01 && charge * (1 - peer) > ikW) { ikW = charge * (1 - peer) * 0.8; T = [k * 0.78, 1.6 + Math.sin(t * 9 + k) * 0.08, 1.35]; e3 = 1.45; }
    if (grab > 0.01 && grab >= ikW) { ikW = grab; const hz = 0.6 + 1.6 * reach * (1 - hold * 0.45); T = [k * (0.22 - 0.1 * hold), 0.95 + 0.6 * hold, hz]; e3 = 1.4 - hold * 0.9; }
    if (ikW > 0.01 && dead < 0.5) {
      const Cy = T[1] + HAND * Math.cos(e3), Cz = T[2] - HAND * Math.sin(e3);
      const sol = ik2(S, T[0], Cy, Cz, A1, A2, -1);
      const w = ikW, lerp = (x: number, y: number) => x + (y - x) * w;
      a1 = lerp(a1, sol.a1); a2 = lerp(a2, sol.a2); a3 = lerp(a3, e3); roll = lerp(roll, sol.roll);
    }
    downQ(a1, roll, _qa); place(R, F, ua, _qa, false);
    downQ(a2, roll, _qb); place(R, F, fa, _qb, false);
    downQ(a3, roll, _qc); place(R, F, ha, _qc, false);
    // fingers: hanging half-curled and twitching; splayed on the floor; spread to snatch; locked shut on a hold
    const open = Math.max(reach * (1 - hold), peer * 0.6, charge * 0.7);
    const tw = Math.pow(Math.max(0, Math.sin(t * 2.1 + k * 3 + s9)), 14) * 0.5 * alive;
    const g = Math.max(0, Math.min(1, 0.3 + tw - open * 0.45 + hold * 0.75 + dead * 0.4));
    place(R, F, ('fing1' + s) as BoneName, eq(0, 0, -k * g * 1.45), true);
    place(R, F, ('fing2' + s) as BoneName, eq(0, 0, -k * g * 1.6), true);
    place(R, F, ('thumb' + s) as BoneName, eq(g * 0.5, k * g * 0.6, -k * g * 0.55), true);
  });
  commit(R, F);
  // ---- the face: slack and half-lidded; it gapes when it runs and when it takes hold
  const ex = dead > 0.5 ? 'dead' : grab > 0.4 || charge > 0.5 ? 'surprised' : listen > 0.4 ? 'think' : 'sleepy';
  if (ud.ex !== ex) { ud.ex = ex; hr.setExpression(ex); }
  hr.lookEyes(Math.max(-2, Math.min(2, -lyaw * 2.5)), lp < -0.2 ? 1 : 0);
  (hr as any).gg?.update?.(dt);
  hr.fx.value.y += dt;
}
const LX2 = 0.09;

// ------------------------------------------------------------------ in-game animation
function animateStrider(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as StriderRig;
  const n = netOf(c), ud = K.m as Record<string, any>, seed = hashId(c.id, 7);
  // velocity from how far it moved (it is moved directly; it steps over the walls)
  const vx = ud.px === undefined ? 0 : (c.x - ud.px) / Math.max(1e-3, dt), vz = ud.pz === undefined ? 0 : (c.z - ud.pz) / Math.max(1e-3, dt);
  ud.px = c.x; ud.pz = c.z;
  ud.vx = (ud.vx ?? 0) + (Math.max(-9, Math.min(9, vx)) - (ud.vx ?? 0)) * Math.min(1, dt * 8);
  ud.vz = (ud.vz ?? 0) + (Math.max(-9, Math.min(9, vz)) - (ud.vz ?? 0)) * Math.min(1, dt * 8);
  if (Math.hypot(c.x - (ud.lx ?? c.x), c.z - (ud.lz ?? c.z)) > 4) ud.feet = undefined; // teleported / first sight
  ud.lx = c.x; ud.lz = c.z;
  let lyaw = 0, lpitch = 0, look = 0;
  const tg = n.tg ? G.players?.get(n.tg) : null;
  const lx = tg ? tg.x : n.lx, lz = tg ? tg.z : n.lz;
  if (lx !== undefined && lz !== undefined && !c.dead) {
    const dx = lx - c.x, dz = lz - c.z, dd = Math.hypot(dx, dz);
    let rel = Math.atan2(dz, dx) - c.facing; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    const eye = n.md === 'peer' ? 1.5 : 4;
    lyaw = -rel; lpitch = Math.atan2((tg ? 1.5 : 0.8) - eye, Math.max(0.6, dd)); look = 1;
  }
  const now = live() ? G.time : t;
  const ac = attackCurve(rig, c, t);
  const gT = n.gT !== undefined && now - n.gT < 2.6 ? now - n.gT : ac.wind > 0 ? ac.wind * GRAB_REACH : -1;
  const z = live() && G.zone?.key === c.zoneKey ? G.zone : null;
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 0.9) : 0;
  poseS(K, {
    t, dt, md: c.dead ? '' : (n.md ?? ''), seed, bx: c.x, bz: c.z, f: c.facing, vx: ud.vx, vz: ud.vz, lyaw, lpitch, look,
    gT, hold: n.hold ? 1 : 0, dead: ease(ud.dk), flinch: flinchOf(c),
    over: z ? (ax, az, bx, bz) => !lineOfSightB(z, ax, az, bx, bz) : undefined,
    onStep: (_s, v, high) => {
      if (!c.visibleToLocal && !(G.local && dist(G.local, c) < 26)) return;
      playAt('strider_land', c, Math.min(1, 0.25 + v * 0.14) * (high ? 1.2 : 1), 22, 0.5 + Math.random() * 0.08);
      if (high) setTimeout(() => playAt('still_neck', c, 0.4, 14, 0.7), 80);
      const p = G.local;
      if (p && p.zoneKey === c.zoneKey && dist(p, c) < 9 && v > 2.5) G.camera?.shake?.(0.12, 0.25, 0.5);
    },
  });
  K.hr.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.5;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'shriek') { playAt('stammer_shriek', c, 1, 30, 0.55); playAt('dread_chase', c, 0.6, 30, 0.9); }
    else if (f.key === 'tilt') playAt('still_neck', c, 0.6, 14, 0.6);
    else if (f.key === 'whisper') playAt('whisper', c, 0.55, 12, 0.75);
    else if (f.key === 'grab') { playAt('dmg_grab', c, 1, 14, 0.7); playAt('bone_crunch', c, 0.6, 12, 0.8); }
  }
  // it is taller than the partitions: from anywhere near you can see it moving over them
  const p = localIn(c);
  if (p && !c.dead && dist(p, c) < 34) { rig.root.visible = true; rig.body.visible = true; }
  if (p && !c.dead) {
    const dd = dist(p, c);
    if (dd < 30 && (ud.brT ?? 0) < t && dd < 8) { ud.brT = t + 3.5; playAt('breath', c, 0.25, 9, 0.55); }
    if (n.md === 'peer' && dd < 16) thinkOnce(p, 'strider_peer', 'It has folded itself down to look into the rooms. Its knees are higher than its head. Do not move.', 60);
    else if (n.md === 'listen' && dd < 22) thinkOnce(p, 'strider_listen', 'It has stopped. Its head is on one side. It is listening for me.', 50);
    else if (n.md === 'charge' && dd < 24) thinkOnce(p, 'strider_charge', ['RUN. A ROOM. A DOOR. ANY DOOR.', 'It is coming over the walls—'][Math.floor(t) % 2], 30);
    else if (dd < 26) thinkOnce(p, 'strider', ['Something is walking over the walls. Over them.', 'It used to be a person. It has a person\'s face. A small one, a long way up.', 'Its legs bend the wrong way. Every step is a metre and a half.'][Math.floor(t * 0.13) % 3], 90);
  }
}

// ------------------------------------------------------------------ host brain
const hall = (z: Zone, x: number, zz: number) => { const tx = Math.floor(x), ty = Math.floor(zz); return z.inb(tx, ty) && !!z.floor[z.idx(tx, ty)] && z.room[z.idx(tx, ty)] === 0; };
const GRAB_RANGE = 2.25;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
/** stride straight toward a point over anything in the halls (never into a room); 'blocked' if the next step would leave the halls */
function strideTo(c: Creature, gx: number, gz: number, speed: number, dt: number, stopAt = 0.6): 'arrived' | 'moving' | 'blocked' {
  const z = zoneOf(c);
  const dx = gx - c.x, dz = gz - c.z, d = Math.hypot(dx, dz);
  if (d <= stopAt) { stop(c); return 'arrived'; }
  c.targetFacing = Math.atan2(dz, dx);
  let off = c.targetFacing - c.facing; while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
  // it turns before it goes (a long body pivots on planted feet)
  const k = Math.max(0, Math.cos(off)) ** 2;
  const step = Math.min(d - stopAt * 0.5, speed * k * dt);
  const nx = c.x + (dx / d) * step, nz = c.z + (dz / d) * step;
  if (!hall(z, nx + (dx / d) * 0.6, nz + (dz / d) * 0.6) && !hall(z, nx, nz)) { stop(c); return 'blocked'; }
  if (!hall(z, nx, nz)) { stop(c); return 'blocked'; }
  c.x = nx; c.z = nz; c.vx = 0; c.vz = 0; c.speed = speed * k;
  return 'moving';
}
/** a hall tile some way off, in a straight line (it does not care what is in between) */
function roamGoal(c: Creature): { x: number; z: number } | null {
  const z = zoneOf(c);
  for (let i = 0; i < 30; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(9, 26);
    const x = c.x + Math.cos(a) * r, zz = c.z + Math.sin(a) * r;
    if (!hall(z, x, zz)) continue;
    // the whole line must stay in the halls (it walks over partitions, not through rooms)
    let ok = true;
    for (let s = 0.5; s < r; s += 0.7) if (!hall(z, c.x + Math.cos(a) * s, c.z + Math.sin(a) * s)) { ok = false; break; }
    if (ok) return { x: Math.floor(x) + 0.5, z: Math.floor(zz) + 0.5 };
  }
  return null;
}
/** the nearest hall tile to a point (where it stands to peer into a room) */
function hallNear(c: Creature, x: number, zz: number): { x: number; z: number } | null {
  const z = zoneOf(c);
  if (hall(z, x, zz)) return { x, z: zz };
  let best: { x: number; z: number } | null = null, bd = 9;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const tx = Math.floor(x) + dx, ty = Math.floor(zz) + dy;
    if (!hall(z, tx + 0.5, ty + 0.5)) continue;
    const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - zz);
    if (d < bd) { bd = d; best = { x: tx + 0.5, z: ty + 0.5 }; }
  }
  return best;
}
/**
 * Its rule: it sees movement, not people. A unit crouched and still is invisible past arm's
 * length; one sneaking is seen only close. Upright, its eyes are over the partitions (it sees
 * across the halls); it cannot see into a room except through an open door, and never
 * through a shut one.
 */
export function striderSees(c: Creature, p: Player): boolean {
  const z = zoneOf(c), d = dist(p, c);
  if (d > 24 || p.body.dead) return false;
  const still = p.stance === 'sneak' && p.speed < 0.15;
  if (still) return d < 1.6;
  if (p.stance === 'sneak' && d > 6) return false;
  const pi = z.idx(Math.floor(p.x), Math.floor(p.z));
  const inRoom = z.inb(Math.floor(p.x), Math.floor(p.z)) && z.room[pi] !== 0;
  const los = lineOfSightB(z, c.x, c.z, p.x, p.z);
  if (inRoom) return d < 9 && los;
  const upright = (net(c).md ?? '') !== 'peer';
  // a cone in front of it (it does not see behind itself)
  let off = Math.atan2(p.z - c.z, p.x - c.x) - c.facing; while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
  if (Math.abs(off) > 2.0 && d > 3) return false;
  return los || (upright && d < 12);
}
function thinkStrider(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const md: string = n.md ?? '';
  // stand somewhere it can stand (spawned in a room: it climbs out over the wall)
  if (!m.init) { m.init = 1; if (!hall(z, c.x, c.z)) { const h = hallNear(c, c.x, c.z); if (h) { c.x = h.x; c.z = h.z; } } setMd(c, 'roam'); }
  // ---- hurt: it turns on whoever did it; badly hurt, it strides away over the walls
  if (ev.hurt > 0) {
    if (c.hp < c.sp.hp * 0.35 && md !== 'flee') { setMd(c, 'flee'); m.goal = roamGoal(c); n.tg = null; n.hold = 0; }
    else if (c.targetId && G.players.has(c.targetId)) { n.tg = c.targetId; m.anger = G.time + 20; if (md !== 'grab') setMd(c, 'charge'); }
  }
  if (md === 'flee') {
    c.setState('flee');
    const r = m.goal ? strideTo(c, m.goal.x, m.goal.z, c.sp.run * 0.85, dt) : 'blocked';
    if (r !== 'moving' || m.mdT > 10) { if (r !== 'moving') m.goal = roamGoal(c); if (m.mdT > 10) { setMd(c, 'roam'); m.calm = G.time + 45; } }
    return true;
  }
  // ---- the grab: arms out, hands shut; then it lets the body go and steps back
  if (md === 'grab') {
    stop(c); c.setState('attack');
    const p = n.tg ? G.players.get(n.tg) as Player | undefined : undefined;
    if (p) faceTo(c, p.x, p.z);
    const tt = G.time - (n.gT ?? G.time);
    if (!m.grabbed && tt >= GRAB_REACH * 0.8) {
      m.grabbed = 1; fx(c, 'grab');
      if (p && dist(p, c) < GRAB_RANGE + 0.6 && c.attackT <= 0) { attack(c, p); n.hold = 1; }
    }
    if (tt > 2.4) {
      m.grabbed = 0; n.gT = undefined; n.hold = 0;
      // fed on fear: it wanders off for a while; angry, it keeps coming
      if (m.anger > G.time && p && striderSees(c, p)) setMd(c, 'charge');
      else { setMd(c, 'roam'); m.calm = G.time + 25; m.goal = roamGoal(c); n.tg = null; }
    }
    return true;
  }
  // ---- watching the survivors
  let seen: Player | null = null, sd = 99;
  if (!(m.calm > G.time)) for (const p of playersIn(c.zoneKey)) { if (striderSees(c, p)) { const d = dist(p, c); if (d < sd) { sd = d; seen = p; } } }
  if (seen) { n.tg = seen.id; m.lastSeen = { x: seen.x, z: seen.z, t: G.time }; }
  // ---- spotted: it goes still, its head comes round to you; then it runs
  if (seen && (md === 'roam' || md === 'listen' || md === 'approach' || md === 'peer' || md === 'search')) {
    if (sd < GRAB_RANGE) { startGrab(c); return true; }
    setMd(c, 'spot'); stop(c); faceTo(c, seen.x, seen.z); fx(c, 'tilt');
    for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 20) { ruleShown(c); break; }
    return true;
  }
  if (md === 'spot') {
    stop(c); c.setState('watch');
    const p = n.tg ? G.players.get(n.tg) as Player | undefined : undefined;
    if (p) faceTo(c, p.x, p.z);
    if (m.mdT > 0.9) {
      if (p && (seen === p || G.time - (m.lastSeen?.t ?? -9) < 0.6)) { setMd(c, 'charge'); if ((m.shriekT ?? 0) < G.time) { m.shriekT = G.time + 10; fx(c, 'shriek'); } }
      else setMd(c, 'search');
    }
    return true;
  }
  if (md === 'charge') {
    c.setState('chase');
    const p = n.tg ? G.players.get(n.tg) as Player | undefined : undefined;
    if (!p || p.zoneKey !== c.zoneKey || p.body.dead) { setMd(c, 'roam'); n.tg = null; return true; }
    const d = dist(p, c);
    if (d < GRAB_RANGE && (seen === p || d < 1.6)) { startGrab(c); return true; }
    // lost sight for more than a moment: go and look where it last saw you
    if (G.time - (m.lastSeen?.t ?? -9) > 1.4) { setMd(c, 'search'); return true; }
    const tx = seen === p ? p.x : m.lastSeen.x, tz = seen === p ? p.z : m.lastSeen.z;
    const r = strideTo(c, tx, tz, c.sp.run, dt, 1.2);
    // you went into a room: it stops at the wall and folds down to reach in
    if (r === 'blocked') { const h = hallNear(c, tx, tz); if (h && Math.hypot(h.x - c.x, h.z - c.z) > 0.8) strideTo(c, h.x, h.z, c.sp.run * 0.6, dt, 0.4); else { setMd(c, 'peer'); n.lx = tx; n.lz = tz; } }
    return true;
  }
  if (md === 'search') {
    c.setState('investigate');
    const L = m.lastSeen ? hallNear(c, m.lastSeen.x, m.lastSeen.z) : null;
    if (!L) { setMd(c, 'peer'); return true; }
    n.lx = m.lastSeen.x; n.lz = m.lastSeen.z;
    const r = strideTo(c, L.x, L.z, c.sp.walk * 1.4, dt, 1.4);
    if (r !== 'moving' || m.mdT > 8) setMd(c, 'peer');
    return true;
  }
  // ---- footsteps: it stops dead, tilts its head toward them, then goes to look
  const heard = c.lastHeard && G.time - c.lastHeard.t < 0.8 && c.lastHeard.r > 0.5;
  if (heard && (md === 'roam' || md === 'peer' && m.mdT > 2) && !(m.calm > G.time)) {
    setMd(c, 'listen'); m.noise = { x: c.lastHeard!.x, z: c.lastHeard!.z }; n.lx = m.noise.x; n.lz = m.noise.z; fx(c, 'tilt');
  }
  if (md === 'listen') {
    stop(c); c.setState('investigate');
    if (m.noise) faceTo(c, m.noise.x, m.noise.z);
    if (m.mdT > 1.6) { const h = m.noise ? hallNear(c, m.noise.x, m.noise.z) : null; if (h) { m.goal = h; setMd(c, 'approach'); fx(c, 'whisper'); } else setMd(c, 'roam'); }
    return true;
  }
  if (md === 'approach') {
    c.setState('stalk');
    const r = m.goal ? strideTo(c, m.goal.x, m.goal.z, c.sp.walk * 1.35, dt, 2.2) : 'arrived';
    if (r !== 'moving' || m.mdT > 12) setMd(c, 'peer');
    return true;
  }
  if (md === 'peer') {
    stop(c); c.setState('watch');
    if (m.noise && m.mdT < 0.2) faceTo(c, m.noise.x, m.noise.z);
    if (m.mdT > 4.5) { setMd(c, 'roam'); m.goal = roamGoal(c); n.lx = undefined; n.lz = undefined; m.noise = null; }
    return true;
  }
  // ---- roaming the halls at the ceiling line; stopping now and then to listen
  if (md !== 'roam') setMd(c, 'roam');
  c.setState('wander');
  if (n.tg && !seen) n.tg = null;
  if (!m.goal || (m.goalT ?? 0) < G.time) { m.goal = roamGoal(c); m.goalT = G.time + rng.float(14, 24); }
  if (m.goal) {
    const r = strideTo(c, m.goal.x, m.goal.z, c.sp.walk, dt, 0.8);
    if (r !== 'moving') { m.goal = null; if (rng.chance(0.5)) { setMd(c, rng.chance(0.4) ? 'peer' : 'listen'); m.noise = null; } }
  } else stop(c);
  if (c.noiseCooldown <= 0 && rng.chance(dt * 0.04)) { fx(c, rng.chance(0.5) ? 'tilt' : 'whisper'); c.noiseCooldown = 9; }
  return true;
}
function startGrab(c: Creature) {
  const n = net(c);
  n.gT = G.time; c.mem.grabbed = 0; setMd(c, 'grab'); stop(c);
}

// ------------------------------------------------------------------ the species
const STRIDER = def({
  key: 'strider', name: 'Strider', code: 'L0-77 // REMNANT, ELONGATED (FORMERLY HUMAN)', temperament: 'stalker', threat: 5,
  rule: { name: 'IT SEES MOVEMENT', text: 'It walks the halls of Level 0 above the partitions and listens for footsteps. Heard, it stops, tilts its head and comes to look, folding itself down to peer into rooms. Seen moving, you are run down in a few strides and grabbed. It does not enter rooms and cannot see through a shut door. Crouch and keep completely still and it cannot see you at all unless it is close enough to touch you.', tell: 'Something tall is walking above the walls. It stopped when I did.' },
  hp: 240, walk: 1.25, run: 5.6, turn: 3.2, radius: 0.5, height: 4.2, sight: 22, fov: 2.0, hearing: 1.9,
  attack: { dmg: [16, 28], range: 2.2, cooldown: 3, kinds: ['bruise', 'fracture', 'laceration'], corrupt: 0.04, knock: 0.5, grab: true, parts: ['torso_u', 'neck', 'head', 'uarm_l', 'uarm_r'] },
  zones: ['lobby'], weight: 0.3, group: [1, 1], maxPerZone: 1, diet: 'meat',
  flags: { nocturnal: false },
  sounds: { idle: 'whisper', alert: 'stammer_shriek', attack: 'dmg_grab', hurt: 'hollow_shriek', death: 'stammer_die', step: 'strider_land' },
  scan: {
    cls: 'Remnant / elongated human',
    notes: [
      'Formerly human. Stands nearly four metres; most of that is three-jointed, backward-bending leg.',
      'Smooth, stretched, sexless skin; ribs and joints showing; a small slack face.',
      'Walks above the partitions. Hunts by sound and by movement.',
      'It does not enter rooms. A shut door stops it seeing you. Stillness hides you.',
    ],
  },
  gore: { blood: 'red', flesh: 0xb04048, gib: false },
  build: () => buildStrider(0), animate: animateStrider, think: thinkStrider,
});
onPlayerHit('strider', (p) => {
  bus.emit('think', p, ['Its hands go all the way round me.', 'It lifted me. My feet are off the floor— it is LOOKING at me—', 'Its face is right there. It is not angry. It is not anything.'][Math.floor(Math.random() * 3)]);
});
TEARS.strider = { parts: [['uarm_l', 2], ['uarm_r', 2], ['farm_l', 1], ['farm_r', 1]], chance: 0.06, hold: 1.8, verb: 'wrench', with: /hand|farm/i, line: 'It is pulling— it is pulling my ARM—' };
defDread('strider', { stutter: 0.06, sting: 'swell', cam: 1, flick: 14 });

// ------------------------------------------------------------------ stand-alone posing (gallery, the video)
export type StriderPose = 'idle' | 'walk' | 'stalk' | 'listen' | 'peer' | 'spot' | 'charge' | 'grab' | 'hold' | 'flee' | 'dead';
/**
 * Animate a Strider rig with no game running: call every frame with a running clock.
 * Walking poses tread in place, or, with { move: true }, carry rig.root forward along
 * its own +z at the pose's speed so the feet stay planted on the floor.
 * `lookYaw`/`lookPitch` aim the head (+yaw toward its left). 'grab' strikes every 3 s
 * unless `strikeT` pins the moment.
 */
export function poseStrider(rig: StriderRig, t: number, dt: number, pose: StriderPose = 'idle', o: { speed?: number; lookYaw?: number; lookPitch?: number; strikeT?: number; move?: boolean } = {}) {
  const ud = rig.m as Record<string, any>;
  const speeds: Partial<Record<StriderPose, number>> = { walk: 1.25, stalk: 0.8, charge: 5.6, flee: 4.8 };
  const v = o.speed ?? speeds[pose] ?? 0;
  // the body travels along +z of the rig (model space == the floor's frame here)
  ud.vbz = (ud.vbz ?? 0) + v * Math.min(0.1, dt);
  if (o.move) rig.root.position.z = ud.vbz;
  const st = o.strikeT ?? (t % 3);
  const lookOn = pose === 'listen' || pose === 'spot' || pose === 'peer' || pose === 'grab' || pose === 'hold' || pose === 'charge' || o.lookYaw !== undefined;
  poseS(rig, {
    t, dt, md: pose === 'walk' || pose === 'idle' || pose === 'dead' || pose === 'hold' ? '' : pose, seed: 0.23,
    bx: 0, bz: ud.vbz, f: Math.PI / 2, vx: 0, vz: v, lyaw: o.lookYaw ?? 0, lpitch: o.lookPitch ?? (pose === 'peer' ? 0.0 : -0.35), look: lookOn ? 1 : 0,
    gT: pose === 'grab' ? st : pose === 'hold' ? 1.5 : -1, hold: pose === 'hold' ? 1 : 0, dead: pose === 'dead' ? 1 : 0, flinch: 0,
  });
}
STRIDER.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['walk', 'listen', 'peer', 'charge', 'grab'][Math.floor(t / 6) % 5]) as StriderPose;
  const num = (k: string) => (u.get(k) !== null ? Number(u.get(k)) : undefined);
  poseStrider(rig as StriderRig, t, 1 / 60, q, { strikeT: num('st'), lookYaw: num('ly') });
};
void STRIDER;
