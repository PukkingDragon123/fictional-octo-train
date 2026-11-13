// Many-legged locomotion for long bodies (round 16, the Worm Train and its larva):
//
//  * Trail: follow-the-leader. The head lays a breadcrumb trail of surface
//    contact points (with the surface's up vector: floor, wall or ceiling);
//    every body segment rides the trail a fixed arc length behind the head, so
//    the body flows round corners and up walls exactly where the head went.
//  * Legs: planted feet in world space. A foot stays where it is until its
//    rest point (under the hip, pushed ahead by the body's velocity) has run too
//    far from it; then it lifts and swings in an arc to the new rest point.
//    A leg may only step while its neighbours (front, behind, opposite) are
//    planted, so the steps ripple down each side in waves.
//  * IK: two-bone, solved in the plane of hip, foot and a pole vector (up and
//    out: the knees ride high, spider fashion). Femur and tibia parts are
//    oriented with their +z along the bone.
// Everything here works in the rig's root-local space (the creature manager
// places the root at the creature with rotation.y = PI/2 - facing); the trail
// itself is world space, converted per frame.
import * as THREE from 'three';

export interface TP { x: number; y: number; z: number; ux: number; uy: number; uz: number }

/** a breadcrumb trail, newest first (pts[0] is the head's current contact point) */
export class Trail {
  pts: TP[] = [];
  constructor(public spacing = 0.2, public maxLen = 30) {}
  get empty() { return this.pts.length === 0; }
  /** start straight: from the head backwards along -dir */
  reset(x: number, y: number, z: number, dx: number, dz: number, up: [number, number, number] = [0, 1, 0]) {
    const l = Math.hypot(dx, dz) || 1;
    this.pts = [];
    const n = Math.ceil(this.maxLen / this.spacing) + 2;
    for (let i = 0; i < n; i++) this.pts.push({ x: x - (dx / l) * i * this.spacing, y, z: z - (dz / l) * i * this.spacing, ux: up[0], uy: up[1], uz: up[2] });
  }
  /** start along a polyline of world points running back from the head (each [x, y, z]) */
  resetAlong(path: [number, number, number][], up: [number, number, number] = [0, 1, 0]) {
    this.pts = [];
    if (!path.length) return;
    this.pts.push({ x: path[0][0], y: path[0][1], z: path[0][2], ux: up[0], uy: up[1], uz: up[2] });
    let acc = 0;
    for (let i = 1; i < path.length && acc < this.maxLen; i++) {
      const a = path[i - 1], b = path[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const n = Math.max(1, Math.round(d / this.spacing));
      for (let k = 1; k <= n; k++) { const t = k / n; this.pts.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t, ux: up[0], uy: up[1], uz: up[2] }); }
      acc += d;
    }
  }
  /** move the head; lays new crumbs every `spacing` metres */
  push(x: number, y: number, z: number, ux: number, uy: number, uz: number) {
    if (!this.pts.length) { this.pts.push({ x, y, z, ux, uy, uz }); return; }
    const h = this.pts[0], n1 = this.pts[1];
    if (!n1) { this.pts.unshift({ x, y, z, ux, uy, uz }); return; }
    const d = Math.hypot(x - n1.x, y - n1.y, z - n1.z);
    if (d > 6) { // teleported: lay it straight behind
      this.reset(x, y, z, x - h.x || 1, z - h.z, [ux, uy, uz]); return;
    }
    if (d >= this.spacing) {
      // the old head becomes a crumb; insert as many as the distance needs
      const k = Math.floor(d / this.spacing);
      const crumbs: TP[] = [];
      for (let i = k; i >= 1; i--) {
        const t = (i * this.spacing) / d;
        crumbs.push({ x: n1.x + (x - n1.x) * t, y: n1.y + (y - n1.y) * t, z: n1.z + (z - n1.z) * t, ux: n1.ux + (ux - n1.ux) * t, uy: n1.uy + (uy - n1.uy) * t, uz: n1.uz + (uz - n1.uz) * t });
      }
      this.pts.splice(1, 0, ...crumbs);
    }
    this.pts[0] = { x, y, z, ux, uy, uz };
    // trim
    let acc = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      acc += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (acc > this.maxLen + 1) { this.pts.length = i + 1; break; }
    }
  }
  /** the point `s` metres back along the trail (clamped to the tail) */
  at(s: number, out: TP): TP {
    const P = this.pts;
    if (!P.length) { out.x = out.y = out.z = 0; out.ux = 0; out.uy = 1; out.uz = 0; return out; }
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (acc + d >= s && d > 1e-6) {
        const t = (s - acc) / d;
        out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
        out.ux = a.ux + (b.ux - a.ux) * t; out.uy = a.uy + (b.uy - a.uy) * t; out.uz = a.uz + (b.uz - a.uz) * t;
        return out;
      }
      acc += d;
    }
    // past the end: extrapolate straight back
    const a = P[Math.max(0, P.length - 2)], b = P[P.length - 1];
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) || 1;
    const over = s - acc;
    out.x = b.x + ((b.x - a.x) / d) * over; out.y = b.y + ((b.y - a.y) / d) * over; out.z = b.z + ((b.z - a.z) / d) * over;
    out.ux = b.ux; out.uy = b.uy; out.uz = b.uz;
    return out;
  }
}

// ------------------------------------------------------------------ frames
const _a: TP = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0 }, _b: TP = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0 }, _c: TP = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** an orthonormal body frame: origin, forward (toward the head), up, right (= up x forward) */
export interface Frame { p: THREE.Vector3; f: THREE.Vector3; u: THREE.Vector3; r: THREE.Vector3; ride: number }
export const newFrame = (): Frame => ({ p: new THREE.Vector3(), f: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(0, 1, 0), r: new THREE.Vector3(1, 0, 0), ride: 1 });

/**
 * The frame of a body segment centred `s` metres back along the trail, riding
 * `ride` metres off the surface; `half` is half its length (for the tangent).
 */
export function trailFrame(tr: Trail, s: number, half: number, ride: number, out: Frame): Frame {
  tr.at(s, _a); tr.at(Math.max(0, s - half), _b); tr.at(s + half, _c);
  out.u.set(_a.ux, _a.uy, _a.uz);
  if (out.u.lengthSq() < 1e-6) out.u.set(0, 1, 0);
  out.u.normalize();
  out.f.set(_b.x - _c.x, _b.y - _c.y, _b.z - _c.z);
  if (out.f.lengthSq() < 1e-8) out.f.set(0, 0, 1);
  out.f.normalize();
  // keep up perpendicular to forward
  out.u.addScaledVector(out.f, -out.u.dot(out.f));
  if (out.u.lengthSq() < 1e-6) out.u.set(0, 1, 0).addScaledVector(out.f, -out.f.y);
  out.u.normalize();
  out.r.crossVectors(out.u, out.f).normalize();
  out.p.set(_a.x, _a.y, _a.z).addScaledVector(out.u, ride);
  out.ride = ride;
  return out;
}

/** world -> rig root-local (root at (rx, ry, rz) turned by ry about +y) */
export function toRoot(root: THREE.Object3D, v: THREE.Vector3): THREE.Vector3 {
  const a = -root.rotation.y, c = Math.cos(a), s = Math.sin(a);
  const x = v.x - root.position.x, y = v.y - root.position.y, z = v.z - root.position.z;
  return v.set(x * c + z * s, y, -x * s + z * c);
}
export function dirToRoot(root: THREE.Object3D, v: THREE.Vector3): THREE.Vector3 {
  const a = -root.rotation.y, c = Math.cos(a), s = Math.sin(a);
  return v.set(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

const _m = new THREE.Matrix4();
/** place a part (child of a group with identity transform under the root) on a frame (root-local) */
export function placeOnFrame(o: THREE.Object3D, p: THREE.Vector3, f: THREE.Vector3, u: THREE.Vector3, r: THREE.Vector3) {
  o.position.copy(p);
  _m.makeBasis(r, u, f);
  o.quaternion.setFromRotationMatrix(_m);
}

// ------------------------------------------------------------------ legs
export interface LegDef {
  seg: number;          // body segment index
  side: 1 | -1;         // +1 right, -1 left (along the frame's r)
  along: number;        // hip offset along the segment (forward +)
  out: number;          // hip offset sideways from the axis
  up: number;           // hip offset up from the axis
  reach: number;        // rest foot: sideways from the axis
  fwd?: number;         // rest foot: extra forward offset
  L1: number; L2: number;
  /** names of the femur and tibia parts */
  femur: string; tibia: string;
}
export interface LegState {
  fx: number; fy: number; fz: number;   // planted foot (world)
  sx: number; sy: number; sz: number;   // swing start
  t: number;                            // swing progress, -1 when planted
  dur: number;
  init: boolean;
}
export const newLegState = (): LegState => ({ fx: 0, fy: 0, fz: 0, sx: 0, sy: 0, sz: 0, t: -1, dur: 0.25, init: false });

export interface GaitOpts {
  /** body velocity (world, m/s) for the step lead */
  vx: number; vy: number; vz: number;
  speed: number;
  /** distance from rest before a foot steps */
  stepDist: number;
  /** swing lift (m) */
  lift: number;
  /** the surface under a world point along the frame's down (floor/ceiling heights); null = the frame's own plane */
  ground?: (x: number, z: number, upY: number) => number | null;
  /** called when a foot lands (sounds, dust) */
  onLand?: (i: number, x: number, y: number, z: number) => void;
  /** pose the feet as curled (dead / hanging) instead of planted */
  curl?: number;
  /** frozen: no stepping */
  freeze?: boolean;
}

const _p2 = new THREE.Vector3(), _rest = new THREE.Vector3(), _hip = new THREE.Vector3(), _knee = new THREE.Vector3(), _foot = new THREE.Vector3(), _pole = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const smooth = (t: number) => t * t * (3 - 2 * t);

/** neighbours of each leg for the wave gating: same side front/back, and the opposite leg */
export function legNeighbours(defs: LegDef[]): number[][] {
  // order along the body, head first
  const key = (d: LegDef) => d.seg * 100 - d.along;
  const out: number[][] = defs.map(() => []);
  for (const side of [1, -1]) {
    const row = defs.map((d, i) => [i, d] as const).filter(([, d]) => d.side === side).sort((a, b) => key(a[1]) - key(b[1]));
    for (let k = 0; k < row.length; k++) {
      if (k > 0) out[row[k][0]].push(row[k - 1][0]);
      if (k + 1 < row.length) out[row[k][0]].push(row[k + 1][0]);
    }
  }
  defs.forEach((d, i) => defs.forEach((e, j) => { if (j !== i && e.side !== d.side && e.seg === d.seg && Math.abs(e.along - d.along) < 0.05) out[i].push(j); }));
  return out;
}

/**
 * Step and pose every leg for one frame. `frames` are the segments' world
 * frames; parts are placed in root-local space.
 */
export function updateLegs(root: THREE.Object3D, parts: Record<string, THREE.Object3D>, defs: LegDef[], st: LegState[], nb: number[][], frames: Frame[], dt: number, o: GaitOpts) {
  let swinging = 0;
  for (const s of st) if (s.t >= 0) swinging++;
  const maxSwing = Math.max(2, Math.ceil(defs.length * 0.4));
  const lead = Math.min(0.45, 0.18 + o.speed * 0.03);
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i], s = st[i], F = frames[d.seg];
    if (!F) continue;
    // hip and rest foot, world
    _hip.copy(F.p).addScaledVector(F.f, d.along).addScaledVector(F.r, d.out * d.side).addScaledVector(F.u, d.up);
    _rest.copy(F.p).addScaledVector(F.f, d.along + (d.fwd ?? 0)).addScaledVector(F.r, d.reach * d.side);
    // down to the surface: the frame's plane, or a measured floor / ceiling
    _rest.addScaledVector(F.u, -surfaceDrop(F, d, o, _rest));
    _rest.x += o.vx * lead; _rest.y += o.vy * lead; _rest.z += o.vz * lead;
    if (!s.init) { s.fx = _rest.x; s.fy = _rest.y; s.fz = _rest.z; s.t = -1; s.init = true; }
    if (o.curl) {
      // dead or hanging: the foot draws in under the body
      const k = o.curl;
      _foot.copy(F.p).addScaledVector(F.f, d.along).addScaledVector(F.r, d.side * (d.out + 0.35)).addScaledVector(F.u, -0.15);
      s.fx += (_foot.x - s.fx) * k; s.fy += (_foot.y - s.fy) * k; s.fz += (_foot.z - s.fz) * k; s.t = -1;
    } else if (s.t >= 0) {
      s.t += dt / s.dur;
      if (s.t >= 1) {
        s.t = -1; s.fx = _rest.x; s.fy = _rest.y; s.fz = _rest.z; swinging--;
        o.onLand?.(i, s.fx, s.fy, s.fz);
      }
    } else if (!o.freeze) {
      const far = Math.hypot(_rest.x - s.fx, _rest.y - s.fy, _rest.z - s.fz);
      const reachMax = (d.L1 + d.L2) * 0.96;
      const over = Math.hypot(_hip.x - s.fx, _hip.y - s.fy, _hip.z - s.fz) > reachMax;
      if ((far > o.stepDist || over) && swinging < maxSwing && !nb[i].some((j) => st[j].t >= 0 && st[j].t < 0.7)) {
        s.sx = s.fx; s.sy = s.fy; s.sz = s.fz; s.t = 0; swinging++;
        s.dur = Math.max(0.11, Math.min(0.34, (o.stepDist / Math.max(0.6, o.speed)) * 0.45));
      }
    }
    // the foot this frame
    if (s.t >= 0) {
      const t = smooth(Math.min(1, s.t)), h = Math.sin(Math.PI * Math.min(1, s.t)) * o.lift;
      _foot.set(s.sx + (_rest.x - s.sx) * t, s.sy + (_rest.y - s.sy) * t, s.sz + (_rest.z - s.sz) * t).addScaledVector(F.u, h);
    } else _foot.set(s.fx, s.fy, s.fz);
    // pole: up and out (knees high)
    _pole.copy(F.u).multiplyScalar(1).addScaledVector(F.r, d.side * 0.55);
    solveLeg(root, parts[d.femur], parts[d.tibia], _hip, _foot, _pole, d.L1, d.L2);
  }
}

/** how far below the hip row the rest foot sits (the surface under the body) */
function surfaceDrop(F: Frame, d: LegDef, o: GaitOpts, rest: THREE.Vector3): number {
  // the frame rides `ride` above its surface; measured ground overrides on floors and ceilings
  const def = F.ride;
  if (o.ground && Math.abs(F.u.y) > 0.75) {
    const gy = o.ground(rest.x, rest.z, F.u.y);
    if (gy !== null) {
      // distance along up from the rest point (at axis height) down to the surface
      const drop = (rest.y - gy) / F.u.y;
      if (drop > 0.2 && drop < def + 2.2) return drop;
    }
  }
  return def;
}

/** two-bone IK, then orient the femur (+z hip->knee) and tibia (+z knee->foot) in root space */
export function solveLeg(root: THREE.Object3D, femur: THREE.Object3D | undefined, tibia: THREE.Object3D | undefined, hipW: THREE.Vector3, footW: THREE.Vector3, poleW: THREE.Vector3, L1: number, L2: number) {
  if (!femur || !tibia) return;
  const H = _v.copy(hipW); toRoot(root, H);
  const Fo = _w.copy(footW); toRoot(root, Fo);
  const P = _p2.copy(poleW); dirToRoot(root, P);
  _d.copy(Fo).sub(H);
  let dl = _d.length();
  if (dl < 1e-5) { _d.set(0, -1, 0); dl = 1e-5; }
  _d.divideScalar(dl);
  const dmax = (L1 + L2) * 0.999, dmin = Math.abs(L1 - L2) + 0.02;
  const dc = Math.max(dmin, Math.min(dmax, dl));
  const a = (L1 * L1 - L2 * L2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  // pole direction perpendicular to the hip-foot line
  P.addScaledVector(_d, -P.dot(_d));
  if (P.lengthSq() < 1e-8) P.set(0, 1, 0).addScaledVector(_d, -_d.y);
  P.normalize();
  _knee.copy(H).addScaledVector(_d, a).addScaledVector(P, h);
  _foot.copy(H).addScaledVector(_d, dc);
  // femur
  _z.copy(_knee).sub(H).normalize();
  _x.crossVectors(P, _z); if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); _x.normalize();
  _y.crossVectors(_z, _x).normalize();
  femur.position.copy(H);
  _m.makeBasis(_x, _y, _z); femur.quaternion.setFromRotationMatrix(_m);
  // tibia
  _z.copy(_foot).sub(_knee).normalize();
  _y.crossVectors(_z, _x).normalize();
  _x.crossVectors(_y, _z).normalize();
  tibia.position.copy(_knee);
  _m.makeBasis(_x, _y, _z); tibia.quaternion.setFromRotationMatrix(_m);
}
