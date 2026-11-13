// Round 16: the motion smoothing layer every creature's rig goes through, so no
// species file has to know (src/creatures/manager.ts updateVisuals drives it):
//  - visual motion: the facing the rig is drawn at follows the simulated one on a
//    critically damped spring (no snapped turns, also between network snapshots),
//    and the speed the species animates with is the speed it really travels at,
//    measured and smoothed (gaits ramp up and wind down instead of popping from
//    stand to run when the brain flips its wish speed)
//  - inertialised pose changes: when a creature changes state (idle, chase,
//    attack, dead, a species' own mode) the whole rig blends out of the pose it
//    was drawn in over ~0.1-0.3 s; any single part that jumps in one frame without
//    having been moving (a pose switch inside a species) is blended the same way
//  - secondary motion: tails, antennae, ears, manes and tendrils lag and overshoot
//    on a damped spring when the body turns and changes speed; the head leads a
//    turn a little, looking where the body is about to go
// The layer is transparent to the species: every frame it puts back the exact
// pose the species (and the layers after it) produced before they run again, so
// species that pose absolutely and those that keep state in their parts both work.
// Frame-held effects (src/creatures/dread.ts stop-motion) are left alone: a held
// frame resets the layer instead of being smoothed away.
import * as THREE from 'three';
import type { Creature } from '../creature';
import type { Rig } from '../species';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// =====================================================================================
// visual motion: facing spring, measured speed
// =====================================================================================
export interface VisMotion {
  /** facing the rig is drawn at (radians, the creature's convention) */
  f: number;
  /** its angular velocity (rad/s, + = facing increasing) */
  fw: number;
  /** measured, smoothed ground speed (m/s) */
  v: number;
  /** smoothed forward acceleration (m/s²) */
  acc: number;
  px: number; pz: number; init: boolean;
}

/** advance the visual facing and speed for this frame (state lives on the rig, so a new rig starts clean) */
export function visualMotion(c: Creature, rig: Rig, dt: number): VisMotion {
  const ud = rig.root.userData;
  let M = ud._vm as VisMotion | undefined;
  if (!M || !M.init) {
    M = ud._vm = { f: c.facing, fw: 0, v: Math.max(0, c.speed || 0), acc: 0, px: c.x, pz: c.z, init: true };
    return M;
  }
  if (dt <= 0) return M;
  const h = Math.min(dt, 0.1);
  // ---- speed: how far it really went, not what the brain wished for
  const d = Math.hypot(c.x - M.px, c.z - M.pz);
  M.px = c.x; M.pz = c.z;
  let v = d / h;
  if (d > 2.5) v = M.v; // a teleport, a respawn, a snap onto a square: not a run
  v = Math.min(v, 14);
  if (v < 0.06) v = 0;
  const v0 = M.v;
  // quicker to speed up than to wind down (bodies push off hard and coast to a stop)
  const k = 1 - Math.exp(-(v > M.v ? 9 : 6) * h);
  M.v += (v - M.v) * k;
  if (M.v < 0.03 && v === 0) M.v = 0;
  M.acc += (clamp((M.v - v0) / h, -20, 20) - M.acc) * (1 - Math.exp(-8 * h));
  // ---- facing: a critically damped spring onto the simulated facing (with a top speed)
  const w0 = 22;
  const err = wrap(c.facing - M.f);
  if (Math.abs(err) > 2.6 && c.dead) { M.f = c.facing; M.fw = 0; }
  else {
    M.fw += (err * w0 * w0 - 2 * w0 * M.fw) * h;
    M.fw = clamp(M.fw, -16, 16);
    M.f = wrap(M.f + M.fw * h);
    if (Math.abs(wrap(c.facing - M.f)) < 1e-4 && Math.abs(M.fw) < 1e-3) { M.f = c.facing; M.fw = 0; }
  }
  return M;
}

// =====================================================================================
// inertialised pose + secondary motion
// =====================================================================================
interface PS {
  o: THREE.Object3D; par: THREE.Object3D | null;
  /** raw Euler (restored exactly, so species that read their parts see what they wrote) */
  rx: number; ry: number; rz: number;
  qr: THREE.Quaternion; qd: THREE.Quaternion; pr: THREE.Vector3; pd: THREE.Vector3;
  off: THREE.Quaternion; poff: THREE.Vector3; t: number; T: number; cubic: boolean;
  d: number; dp: number;
  /** 0 none, 1 trailing appendage (tail, antenna...), 2 head/neck (leads turns) */
  sec: number; sa: number; sv: number; sb: number; sbv: number;
}
interface SM { parts: PS[]; key: string; init: boolean; n: number }

/** dev: how often the layer stepped in (window.__smooth) */
const STATS = { frames: 0, blends: 0, pops: 0 };
try { (globalThis as any).__smooth = STATS; } catch { /* no window */ }
const SEC_TRAIL = /tail|antenn|feeler|whisk|tendril|tentac|mane|frond|streamer|ribbon|tassel|^ear|ear[LR0-9]?$|wattle|dewlap|pennant|flag/i;
const SEC_HEAD = /^(head|neck)$/i;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function build(rig: Rig): SM {
  const seen = new Set<THREE.Object3D>();
  const parts: PS[] = [];
  const add = (o: THREE.Object3D | undefined, name: string) => {
    if (!o || seen.has(o) || o === rig.root || !o.matrixAutoUpdate) return;
    seen.add(o);
    parts.push({
      o, par: o.parent, rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z,
      qr: o.quaternion.clone(), qd: o.quaternion.clone(), pr: o.position.clone(), pd: o.position.clone(),
      off: new THREE.Quaternion(), poff: new THREE.Vector3(), t: 1, T: 0, cubic: false, d: 0, dp: 0,
      sec: SEC_HEAD.test(name) ? 2 : SEC_TRAIL.test(name) ? 1 : 0, sa: 0, sv: 0, sb: 0, sbv: 0,
    });
  };
  add(rig.body, 'body');
  for (const [n, o] of Object.entries(rig.parts)) add(o, n);
  return { parts, key: '', init: false, n: Object.keys(rig.parts).length };
}
const stateOf = (rig: Rig): SM => {
  const ud = rig.root.userData;
  let S = ud._sm as SM | undefined;
  // a rig that grew parts after it was built (gore stumps, a disguise swap): track the new ones too
  if (!S || S.n !== Object.keys(rig.parts).length) { S = ud._sm = build(rig); }
  return S;
};

/** before anything poses the rig this frame: put back the pose the species and layers made last frame */
export function smoothBegin(rig: Rig) {
  const S = rig.root.userData._sm as SM | undefined;
  if (!S || !S.init) return;
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const P = S.parts[i];
    // cut off and thrown (gore), reparented by something else: no longer ours
    if (P.o.parent !== P.par) { S.parts.splice(i, 1); continue; }
    P.o.rotation.set(P.rx, P.ry, P.rz);
    P.o.position.copy(P.pr);
  }
}

/** what a creature is doing, as far as its pose is concerned: a change blends the whole rig */
function keyOf(c: Creature): string {
  const n = (c.mem.netMem || c.mem.net || {}) as Record<string, any>;
  return c.state + '|' + (c.dead ? 1 : 0) + '|' + (c.attackPhase > 0 ? 1 : 0) + '|' + (n.md ?? '') + '|' + (n.sit ?? '') + '|' + (c.mem.cb ? 1 : 0);
}
function blendFor(a: string, b: string): number {
  const A = a.split('|'), B = b.split('|');
  if (A[1] !== B[1]) return 0.32;           // dying
  if (A[2] !== B[2]) return B[2] === '1' ? 0.09 : 0.22; // into an attack: barely (keep it sharp); out of one: settle
  if (A[3] !== B[3]) return 0.26;           // a species' own mode
  return 0.22;                              // brain state
}

/**
 * After every layer posed the rig: record that pose, blend out of pops and state changes,
 * add the secondary motion. `held`: the dread layer held this frame (stop-motion): reset instead.
 */
export function smoothEnd(c: Creature, rig: Rig, dt: number, held: boolean, M: VisMotion | null) {
  const S = stateOf(rig);
  const key = keyOf(c);
  const first = !S.init;
  const T = !first && key !== S.key ? blendFor(S.key, key) : 0;
  STATS.frames++; if (T > 0) STATS.blends++;
  S.key = key;
  S.init = true;
  const h = Math.min(Math.max(dt, 0), 0.1);
  const glitchy = !!(c.sp.flags?.glitch);
  // a part that jumps this far in one frame (from rest) is a pose switch, not a motion
  const thr = 0.42 + 4 * h, pthr = (0.12 + 2 * h) * Math.max(1, rig.body.scale.y);
  const live = !c.dead && !held && M && h > 0;
  const fw = live ? -(M!.fw) : 0;           // the rig's yaw rate (three.js: rotation.y = π/2 - facing)
  const acc = live ? M!.acc : 0, spd = live ? M!.v : 0;
  for (const P of S.parts) {
    const o = P.o;
    _q.copy(o.quaternion);
    _p.copy(o.position);
    const rx = o.rotation.x, ry = o.rotation.y, rz = o.rotation.z;
    if (first || held || glitchy || h <= 0) {
      P.qr.copy(_q); P.qd.copy(_q); P.pr.copy(_p); P.pd.copy(_p);
      P.rx = rx; P.ry = ry; P.rz = rz; P.t = P.T = 0; P.d = P.dp = 0; P.sa = P.sv = P.sb = P.sbv = 0;
      continue;
    }
    const d = P.qr.angleTo(_q), dp = P.pr.distanceTo(_p);
    const pop = (d > thr && d > P.d * 3 + 0.05) || (dp > pthr && dp > P.dp * 3 + 0.02);
    if (T > 0 || pop) {
      if (pop && T <= 0) STATS.pops++;
      // blend from what is on screen now into the new pose
      P.off.copy(P.qd).multiply(_qi.copy(_q).invert());
      P.poff.copy(P.pd).sub(_p);
      P.t = 0; P.T = T > 0 ? T : 0.14; P.cubic = T > 0;
    }
    P.d = d; P.dp = dp;
    P.qr.copy(_q); P.pr.copy(_p); P.rx = rx; P.ry = ry; P.rz = rz;
    let shown = false;
    if (P.t < P.T) {
      P.t += h;
      const u = Math.min(1, P.t / P.T);
      const w = P.cubic ? (1 - u) * (1 - u) * (1 + 2 * u) : (1 - u) * (1 - u);
      if (w > 1e-3) {
        _q2.identity().slerp(P.off, w);
        o.quaternion.copy(_q2).multiply(_q);
        o.position.copy(_p).addScaledVector(P.poff, w);
        shown = true;
      } else P.T = 0;
    }
    // ---- secondary motion: appendages trail the turn and the push, heads lead the turn
    if (P.sec && live) {
      let ta: number, tb: number, K: number, C: number;
      if (P.sec === 1) {
        ta = clamp(-fw * 0.085, -0.42, 0.42);
        tb = clamp(acc * 0.018 + (spd > 0.3 ? -0.04 : 0), -0.22, 0.22);
        K = 70; C = 7.5;
      } else {
        ta = clamp(fw * 0.07, -0.26, 0.26);
        tb = clamp(-acc * 0.01, -0.08, 0.08);
        K = 140; C = 20;
      }
      P.sv += ((ta - P.sa) * K - P.sv * C) * h; P.sa += P.sv * h;
      P.sbv += ((tb - P.sb) * K - P.sbv * C) * h; P.sb += P.sbv * h;
      P.sa = clamp(P.sa, -0.6, 0.6); P.sb = clamp(P.sb, -0.35, 0.35);
      if (Math.abs(P.sa) + Math.abs(P.sb) > 1e-4 && o.parent) {
        // about the world's up (yaw) and the body's side (pitch), expressed in the parent's frame
        o.parent.getWorldQuaternion(_pq).invert();
        _ay.copy(_up).applyQuaternion(_pq);
        rig.body.getWorldQuaternion(_q2);
        _ax.set(1, 0, 0).applyQuaternion(_q2).applyQuaternion(_pq);
        if (!shown) { o.quaternion.copy(_q); shown = true; }
        o.quaternion.premultiply(_q2.setFromAxisAngle(_ay, P.sa)).premultiply(_q2.setFromAxisAngle(_ax, P.sb));
      }
    } else if (P.sec) { P.sa *= 0.9; P.sb *= 0.9; P.sv = P.sbv = 0; }
    P.qd.copy(o.quaternion); P.pd.copy(o.position);
  }
}

/** a body leaning into its turns and its pushes (root pitch / roll added by the manager) */
export function leanOf(c: Creature, M: VisMotion | null): { pitch: number; roll: number } {
  if (!M || c.dead || c.sp.flags?.attached) return { pitch: 0, roll: 0 };
  const big = clamp(1.2 - c.height * 0.12, 0.45, 1);
  const fly = c.sp.flags?.flying ? 1.8 : 1;
  // centripetal: v * yaw rate; it leans into the curve (and banks harder when it flies)
  const roll = clamp(M.v * M.fw * 0.022 * fly, -0.16 * fly, 0.16 * fly) * big;
  // braking dips the front, pushing off sits it back a little
  const pitch = clamp(-M.acc * 0.012, -0.07, 0.07) * big;
  return { pitch, roll };
}
