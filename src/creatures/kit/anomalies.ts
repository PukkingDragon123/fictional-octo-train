// Kit for the furniture / anomaly creatures (swivel, davenport, underlay,
// occupant, plushkin, lamplighter): one skinned mesh per material per rig
// (a draw call or two per creature), smooth-shaded organic primitives that
// texture from the shared pixel-art atlas, and small procedural-animation
// helpers.
//
// Skinned rigs stay compatible with the gore system (src/gore): every bone is
// a named Group in rig.parts with an invisible proxy mesh. The proxy carries
// the bone's bounding box (Gibs.measure) and its clone() returns a static mesh
// of that bone's own triangles, so `part.clone(true)` rebuilds a severed limb
// (or, from rig.body, the whole carcass) in its current pose. A bone that has
// been detached from the rig, or hidden (limbs lost while alive), collapses
// its vertices to nothing in the skeleton update.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { atlas } from '../../gfx/atlas';
import { creatureMaterial, newRig, Rig } from '../species';
import type { Creature } from '../creature';

export type V3 = [number, number, number];

// ====================================================================== smooth surfaces
const TMP_V = new THREE.Vector3(), TMP_N = new THREE.Vector3(), TMP_M3 = new THREE.Matrix3();
const ID = new THREE.Matrix4();
/** the builder's current transform (ModelBuilder keeps it private) */
export const mbMatrix = (mb: ModelBuilder): THREE.Matrix4 => (mb as unknown as { m: THREE.Matrix4 }).m ?? ID;

export interface SurfOpts {
  /** vertex tint */
  color?: number;
  /** per-vertex brightness (AO in creases, wet sheen...) on top of the tint */
  shade?: (i: number, j: number, p: V3) => number;
  /** per-vertex tint (overrides color) */
  tint?: (i: number, j: number, p: V3) => number;
  emissive?: number;
  /** flip the automatic outward orientation */
  flip?: boolean;
  /** orient faces away from this point (default: the centroid); null keeps the parametric orientation */
  inside?: V3 | null;
  /** fake top-light shading like ModelBuilder's faces (default true) */
  ao?: boolean;
  /** flat normals (faceted) */
  flat?: boolean;
}

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a: V3): V3 => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Generic grid surface with smooth normals. P(i, j) for i in 0..nu, j in 0..nv;
 * UV(i, j) in texture repeats (fit textures: 0..1). Appended into `mb` under
 * its current transform.
 */
export function surf(mb: ModelBuilder, nu: number, nv: number, P: (i: number, j: number) => V3, UV: (i: number, j: number, p: V3) => [number, number], tex: string, o: SurfOpts = {}) {
  const W = nu + 1, H = nv + 1, n = W * H;
  const pts: V3[] = new Array(n);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) pts[j * W + i] = P(i, j);
  // orientation
  let flip = !!o.flip;
  if (o.inside !== null) {
    let c: V3 = [0, 0, 0];
    if (o.inside) c = o.inside;
    else { for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } c = [c[0] / n, c[1] / n, c[2] / n]; }
    let s = 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = pts[j * W + i], b = pts[j * W + i + 1], d = pts[(j + 1) * W + i], cc = pts[(j + 1) * W + i + 1];
      const nn = cross3(sub3(cc, a), sub3(d, b));
      const m: V3 = [(a[0] + cc[0]) / 2 - c[0], (a[1] + cc[1]) / 2 - c[1], (a[2] + cc[2]) / 2 - c[2]];
      s += dot3(nn, m);
    }
    if (s < 0) flip = !flip;
  }
  // smooth normals: face normals accumulated at the corners, coincident points merged
  const N: V3[] = pts.map(() => [0, 0, 0] as V3);
  const faceN = (a: V3, b: V3, c: V3, d: V3): V3 => { const nn = cross3(sub3(c, a), sub3(d, b)); return flip ? [-nn[0], -nn[1], -nn[2]] : nn; };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const ia = j * W + i, ib = ia + 1, id = ia + W, ic = id + 1;
    const fn = faceN(pts[ia], pts[ib], pts[ic], pts[id]);
    for (const k of [ia, ib, ic, id]) { N[k][0] += fn[0]; N[k][1] += fn[1]; N[k][2] += fn[2]; }
  }
  if (!o.flat) {
    const groups = new Map<string, number[]>();
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      const key = Math.round(p[0] * 4000) + ',' + Math.round(p[1] * 4000) + ',' + Math.round(p[2] * 4000);
      let l = groups.get(key); if (!l) groups.set(key, l = []); l.push(k);
    }
    for (const l of groups.values()) {
      if (l.length < 2) continue;
      const s: V3 = [0, 0, 0];
      for (const k of l) { s[0] += N[k][0]; s[1] += N[k][1]; s[2] += N[k][2]; }
      for (const k of l) N[k] = [s[0], s[1], s[2]];
    }
  }
  const r = atlas().get(tex);
  const m = mbMatrix(mb);
  TMP_M3.getNormalMatrix(m);
  const tint = o.color ?? 0xffffff;
  const emis = o.emissive ?? 0;
  const ao = o.ao !== false;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], atl: number[] = [], fx: number[] = [], idx: number[] = [];
  const emit = (k: number, i: number, j: number, nn: V3) => {
    const p = pts[k];
    TMP_V.set(p[0], p[1], p[2]).applyMatrix4(m);
    TMP_N.set(nn[0], nn[1], nn[2]).applyMatrix3(TMP_M3).normalize();
    pos.push(TMP_V.x, TMP_V.y, TMP_V.z);
    nor.push(TMP_N.x, TMP_N.y, TMP_N.z);
    const t = UV(i, j, p);
    uv.push(t[0], t[1]);
    const c = o.tint ? o.tint(i, j, p) : tint;
    let s = o.shade ? o.shade(i, j, p) : 1;
    if (ao) { const ny = TMP_N.y; s *= ny >= 0 ? 0.9 + 0.1 * ny : 0.9 + 0.32 * ny; }
    col.push(((c >> 16) & 255) / 255 * s, ((c >> 8) & 255) / 255 * s, (c & 255) / 255 * s);
    atl.push(r.u0, r.v0, r.du, r.dv);
    fx.push(emis, 0);
  };
  if (o.flat) {
    // faceted: unshared vertices per quad
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const ia = j * W + i, ib = ia + 1, id = ia + W, ic = id + 1;
      const fn = norm3(faceN(pts[ia], pts[ib], pts[ic], pts[id]));
      if (!isFinite(fn[0]) || len3(fn) < 0.5) continue;
      const base = pos.length / 3;
      emit(ia, i, j, fn); emit(ib, i + 1, j, fn); emit(ic, i + 1, j + 1, fn); emit(id, i, j + 1, fn);
      pushQuad(idx, base, base + 1, base + 2, base + 3, flip, pts[ia], pts[ib], pts[ic], pts[id]);
    }
  } else {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; emit(k, i, j, norm3(N[k])); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const ia = j * W + i, ib = ia + 1, id = ia + W, ic = id + 1;
      pushQuad(idx, ia, ib, ic, id, flip, pts[ia], pts[ib], pts[ic], pts[id]);
    }
  }
  if (!idx.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aAtlas', new THREE.Float32BufferAttribute(atl, 4));
  g.setAttribute('aFx', new THREE.Float32BufferAttribute(fx, 2));
  g.setIndex(idx);
  mb.appendGeometry(g, ID);
  g.dispose();
}

function pushQuad(idx: number[], a: number, b: number, c: number, d: number, flip: boolean, A: V3, B: V3, C: V3, D: V3) {
  const t1 = len3(cross3(sub3(B, A), sub3(C, A))) > 1e-12, t2 = len3(cross3(sub3(C, A), sub3(D, A))) > 1e-12;
  // parametric order a(i,j) b(i+1,j) c(i+1,j+1) d(i,j+1): normal = (c-a)x(d-b) is +u x +v
  if (!flip) { if (t1) idx.push(a, b, c); if (t2) idx.push(a, c, d); }
  else { if (t1) idx.push(a, c, b); if (t2) idx.push(a, d, c); }
}

/** metres → texture repeats for an atlas texture */
export function texM(tex: string): [number, number] { const r = atlas().get(tex); return [r.mw, r.mh]; }

export interface TubeOpts extends SurfOpts {
  /** cross-section squash: [x, y] scale of the ring in the frame (1 = round) */
  squash?: [number, number] | ((t: number) => [number, number]);
  /** close the ends with a rounded cap (rings toward the axis) */
  capStart?: boolean; capEnd?: boolean;
  /** stretch the texture once around (u) and/or along (v) */
  fitU?: boolean; fitV?: boolean;
  /** extra texture offset (repeats) */
  u0?: number; v0?: number;
  /** reference "up" for the first frame (default world y, or z for vertical tubes) */
  up?: V3;
  /** angular offset of the seam */
  seam?: number;
  /** radial displacement per vertex: (t, angle) → multiplier around 1 */
  bump?: (t: number, a: number) => number;
}

/**
 * Tube along a polyline with radius r(t) (t = 0..1 along the length), segs
 * around; smooth shaded. Parallel-transport frames, so it does not twist.
 */
export function tube(mb: ModelBuilder, path: V3[], r: number | ((t: number) => number), segs: number, tex: string, o: TubeOpts = {}) {
  const rf = typeof r === 'number' ? () => r : r;
  const npts = path.length;
  // arc length
  const s: number[] = [0];
  for (let i = 1; i < npts; i++) s.push(s[i - 1] + len3(sub3(path[i], path[i - 1])));
  const L = s[npts - 1] || 1;
  // frames
  const T: V3[] = path.map((_, i) => norm3(sub3(path[Math.min(npts - 1, i + 1)], path[Math.max(0, i - 1)])));
  const up = o.up ?? (Math.abs(T[0][1]) > 0.9 ? [0, 0, 1] as V3 : [0, 1, 0] as V3);
  let Nn = norm3(cross3(cross3(T[0], up), T[0]));
  if (!isFinite(Nn[0])) Nn = [1, 0, 0];
  const NS: V3[] = [Nn], BS: V3[] = [norm3(cross3(T[0], Nn))];
  for (let i = 1; i < npts; i++) {
    // project previous normal onto the new tangent plane
    const prev = NS[i - 1];
    const d = dot3(prev, T[i]);
    let nn = norm3([prev[0] - T[i][0] * d, prev[1] - T[i][1] * d, prev[2] - T[i][2] * d]);
    if (!isFinite(nn[0])) nn = prev;
    NS.push(nn); BS.push(norm3(cross3(T[i], nn)));
  }
  // rings: optional caps add rings that close to the axis
  interface Ring { c: V3; n: V3; b: V3; r: number; t: number; v: number }
  const rings: Ring[] = [];
  const capRings = (i: number, dir: number, out: Ring[]) => {
    const r0 = rf(s[i] / L);
    for (const k of [0.92, 0.7, 0.38, 0]) {
      const a = Math.acos(Math.min(1, k));
      const off = Math.sin(a) * r0 * 0.85 * dir;
      const tt: V3 = T[i];
      out.push({ c: [path[i][0] + tt[0] * off, path[i][1] + tt[1] * off, path[i][2] + tt[2] * off], n: NS[i], b: BS[i], r: r0 * k, t: s[i] / L, v: s[i] + off });
    }
  };
  if (o.capStart) { const cs: Ring[] = []; capRings(0, -1, cs); rings.push(...cs.reverse()); }
  for (let i = 0; i < npts; i++) rings.push({ c: path[i], n: NS[i], b: BS[i], r: rf(s[i] / L), t: s[i] / L, v: s[i] });
  if (o.capEnd) capRings(npts - 1, 1, rings);
  const [mw, mh] = texM(tex);
  let rAvg = 0; for (const g of rings) rAvg += g.r; rAvg = Math.max(0.001, rAvg / rings.length);
  const circ = 2 * Math.PI * rAvg;
  const seam = o.seam ?? 0;
  const sq = o.squash;
  surf(mb, segs, rings.length - 1, (i, j) => {
    const g = rings[j];
    const a = seam + (i / segs) * Math.PI * 2;
    const q = typeof sq === 'function' ? sq(g.t) : sq || [1, 1];
    const rr = g.r * (o.bump ? o.bump(g.t, a) : 1);
    const cx = Math.cos(a) * rr * q[0], cy = Math.sin(a) * rr * q[1];
    return [g.c[0] + g.n[0] * cx + g.b[0] * cy, g.c[1] + g.n[1] * cx + g.b[1] * cy, g.c[2] + g.n[2] * cx + g.b[2] * cy];
  }, (i, j) => {
    const g = rings[j];
    const u = o.fitU ? i / segs : (i / segs) * circ / mw;
    const v = o.fitV ? (g.v - (rings[0].v)) / ((rings[rings.length - 1].v - rings[0].v) || 1) : g.v / mh;
    return [u + (o.u0 ?? 0), v + (o.v0 ?? 0)];
  }, tex, { ...o, inside: o.inside === undefined ? null : o.inside });
}

export interface BlobOpts extends SurfOpts {
  /** radial displacement: (dir) → multiplier around 1 */
  disp?: (d: V3, u: number, v: number) => number;
  fit?: boolean;
  /** only part of the sphere: v range 0 (top) .. 1 (bottom) */
  v0?: number; v1?: number;
  /** rotate the texture seam */
  seam?: number;
}

/** deformed ellipsoid, smooth shaded */
export function blob(mb: ModelBuilder, c: V3, r: V3, segs: number, rings: number, tex: string, o: BlobOpts = {}) {
  const [mw, mh] = texM(tex);
  const v0 = o.v0 ?? 0, v1 = o.v1 ?? 1;
  const seam = o.seam ?? 0;
  const circ = Math.PI * (r[0] + r[2]), half = Math.PI * r[1];
  surf(mb, segs, rings, (i, j) => {
    const th = seam + (i / segs) * Math.PI * 2, ph = (v0 + (j / rings) * (v1 - v0)) * Math.PI;
    const d: V3 = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
    const k = o.disp ? o.disp(d, i / segs, j / rings) : 1;
    return [c[0] + d[0] * r[0] * k, c[1] + d[1] * r[1] * k, c[2] + d[2] * r[2] * k];
  }, (i, j) => o.fit ? [i / segs, 1 - j / rings] : [(i / segs) * circ / mw, (1 - (v0 + (j / rings) * (v1 - v0))) * half / mh], tex, { ...o, inside: o.inside === undefined ? c : o.inside });
}

/** surface of revolution around +y through `c`: profile [radius, y] bottom → top */
export function lathe(mb: ModelBuilder, c: V3, profile: [number, number][], segs: number, tex: string, o: SurfOpts & { fit?: boolean; sq?: [number, number] } = {}) {
  const [mw, mh] = texM(tex);
  const s: number[] = [0];
  for (let i = 1; i < profile.length; i++) s.push(s[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  let rAvg = 0; for (const p of profile) rAvg += p[0]; rAvg /= profile.length;
  const q = o.sq ?? [1, 1];
  surf(mb, segs, profile.length - 1, (i, j) => {
    const a = (i / segs) * Math.PI * 2;
    const [rr, y] = profile[j];
    return [c[0] + Math.sin(a) * rr * q[0], c[1] + y, c[2] + Math.cos(a) * rr * q[1]];
  }, (i, j) => o.fit ? [i / segs, s[j] / (s[s.length - 1] || 1)] : [(i / segs) * 2 * Math.PI * Math.max(0.005, rAvg) / mw, s[j] / mh], tex, { ...o, inside: o.inside === undefined ? null : o.inside });
}

/** a pointed tooth / claw / spike: square pyramid from base centre along dir (flat shaded) */
export function spike(mb: ModelBuilder, base: V3, dir: V3, len: number, w: number, tex: string, color = 0xffffff, curve = 0, sides = 4, emis = 0) {
  const d = norm3(dir);
  const ref: V3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a = norm3(cross3(d, ref)), b = norm3(cross3(d, a));
  const tip: V3 = [base[0] + d[0] * len + b[0] * curve, base[1] + d[1] * len + b[1] * curve, base[2] + d[2] * len + b[2] * curve];
  const ring: V3[] = [];
  for (let k = 0; k < sides; k++) {
    const t = (k / sides) * Math.PI * 2 + Math.PI / sides;
    ring.push([base[0] + (a[0] * Math.cos(t) + b[0] * Math.sin(t)) * w, base[1] + (a[1] * Math.cos(t) + b[1] * Math.sin(t)) * w, base[2] + (a[2] * Math.cos(t) + b[2] * Math.sin(t)) * w]);
  }
  for (let k = 0; k < sides; k++) {
    const p0 = ring[k], p1 = ring[(k + 1) % sides];
    mb.triRaw([p0, p1, tip], [[0, 0], [1, 0], [0.5, 1]], tex, color, 0.85 + 0.15 * Math.cos((k / sides) * 6.28), emis);
  }
}

/** a molar / flat tooth: a small bevelled block standing on `base` pointing along `dir` */
export function molar(mb: ModelBuilder, base: V3, dir: V3, h: number, w: number, d: number, tex: string, color = 0xffffff) {
  const n = norm3(dir);
  const ref: V3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a = norm3(cross3(n, ref)), b = norm3(cross3(n, a));
  const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(...a), new THREE.Vector3(...n), new THREE.Vector3(...b));
  M.setPosition(base[0], base[1], base[2]);
  mb.push().matrix(M);
  mb.box(0, 0, 0, w, h, d, tex, { color, fit: true, skip: ['bottom'] });
  mb.pop();
}

// ====================================================================== skinned rigs
type Weights = [number, number][];
interface Chunk { geo: THREE.BufferGeometry; bone: number; wfn?: (p: V3) => Weights; mat: string; space: 'local' | 'body' }

/** a rig built by SkinKit: the plain Rig plus its skinned meshes */
export interface KRig extends Rig {
  skins: Record<string, THREE.SkinnedMesh>;
  skeleton: THREE.Skeleton;
  /** rest (bind) transforms, for animations that need them */
  restPos: Record<string, THREE.Vector3>;
}

const MAT_GLOW = () => creatureMaterial(true);

/**
 * Builds a skinned creature: bones (named Groups, rig.parts) in a hierarchy
 * under rig.body, geometry chunks bound rigidly to one bone or blended with a
 * weight function, merged into one SkinnedMesh per material.
 */
export class SkinKit {
  readonly rig: KRig;
  private bones: THREE.Group[] = [];
  private restW: THREE.Matrix4[] = [];
  private map = new Map<string, number>();
  private chunks: Chunk[] = [];
  private mats: Record<string, THREE.Material>;

  constructor(headY: number, mats: Record<string, THREE.Material> = {}) {
    const r = newRig(headY) as KRig;
    r.skins = {}; r.restPos = {};
    this.rig = r;
    this.mats = { n: creatureMaterial(false), g: MAT_GLOW(), ...mats };
  }

  has(name: string) { return this.map.has(name); }
  group(name: string) { return this.bones[this.map.get(name)!]; }
  /** body-space rest position of a bone */
  restOf(name: string): V3 { const v = new THREE.Vector3().setFromMatrixPosition(this.restW[this.map.get(name)!]); return [v.x, v.y, v.z]; }

  /** add a bone; pos / rot are relative to the parent bone (or the body) in the rest pose */
  bone(name: string, parent: string | null, pos: V3, rot: V3 = [0, 0, 0]): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.set(rot[0], rot[1], rot[2]);
    const pi = parent ? this.map.get(parent) : undefined;
    if (parent && pi === undefined) throw new Error('SkinKit: no bone ' + parent);
    (pi !== undefined ? this.bones[pi] : this.rig.body).add(g);
    g.updateMatrix();
    const w = pi !== undefined ? this.restW[pi].clone().multiply(g.matrix) : g.matrix.clone();
    this.map.set(name, this.bones.length);
    this.bones.push(g);
    this.restW.push(w);
    this.rig.parts[name] = g;
    this.rig.restPos[name] = g.position.clone();
    g.userData.restRot = g.rotation.clone();
    return g;
  }

  /** rigid geometry authored in the bone's own (rest) frame */
  local(bone: string, fn: (mb: ModelBuilder) => void, mat = 'n') { this.push(bone, fn, mat, 'local'); }
  /** rigid geometry authored in body space, rest pose */
  body(bone: string, fn: (mb: ModelBuilder) => void, mat = 'n') { this.push(bone, fn, mat, 'body'); }
  /** body-space geometry blended between bones: weights(p) → [[bone, w], ...] */
  blend(fn: (mb: ModelBuilder) => void, weights: (p: V3) => [string, number][], mat = 'n') {
    const mb = new ModelBuilder(); fn(mb);
    if (mb.isEmpty) return;
    const map = this.map;
    this.chunks.push({ geo: mb.build(), bone: -1, mat, space: 'body', wfn: (p) => weights(p).map(([n, w]) => [map.get(n) ?? 0, w]) });
  }
  private push(bone: string, fn: (mb: ModelBuilder) => void, mat: string, space: 'local' | 'body') {
    const bi = this.map.get(bone);
    if (bi === undefined) throw new Error('SkinKit: no bone ' + bone);
    const mb = new ModelBuilder(); fn(mb);
    if (!mb.isEmpty) this.chunks.push({ geo: mb.build(), bone: bi, mat, space });
  }

  /** merge everything into skinned meshes and wire proxies for gore */
  finish(o: { sphere?: [number, number, number, number]; onRoot?: string[] } = {}): KRig {
    const rig = this.rig, nb = this.bones.length;
    const inv = this.restW.map((m) => m.clone().invert());
    const skeleton = new THREE.Skeleton(this.bones as unknown as THREE.Bone[], inv);
    rig.skeleton = skeleton;
    const body = rig.body, bones = this.bones;
    const live = (b: THREE.Object3D) => { let p: THREE.Object3D | null = b; while (p && p !== body) { if (!p.visible) return false; p = p.parent; } return p === body; };
    const upd = skeleton.update.bind(skeleton);
    skeleton.update = () => {
      upd();
      const bm = skeleton.boneMatrices;
      for (let i = 0; i < nb; i++) if (!live(bones[i])) bm.fill(0, i * 16, i * 16 + 16);
    };
    const keys = [...new Set(this.chunks.map((c) => c.mat))];
    const v = new THREE.Vector3(), nrm = new THREE.Vector3(), m3 = new THREE.Matrix3();
    const bbMin = new THREE.Vector3(Infinity, Infinity, Infinity), bbMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const key of keys) {
      const list = this.chunks.filter((c) => c.mat === key);
      let nv = 0, ni = 0;
      for (const c of list) { nv += c.geo.getAttribute('position').count; ni += c.geo.getIndex()!.count; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), UV = new Float32Array(nv * 2), C = new Float32Array(nv * 3), A = new Float32Array(nv * 4), F = new Float32Array(nv * 2);
      const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
      const dom = new Uint16Array(nv);
      const I: number[] = new Array(ni);
      let vo = 0, io = 0;
      for (const c of list) {
        const g = c.geo;
        const gp = g.getAttribute('position'), gn = g.getAttribute('normal'), gu = g.getAttribute('uv'), gc = g.getAttribute('color'), ga = g.getAttribute('aAtlas'), gf = g.getAttribute('aFx');
        const toBody = c.space === 'local' ? this.restW[c.bone] : null;
        if (toBody) m3.getNormalMatrix(toBody);
        for (let k = 0; k < gp.count; k++) {
          v.set(gp.getX(k), gp.getY(k), gp.getZ(k));
          nrm.set(gn.getX(k), gn.getY(k), gn.getZ(k));
          if (toBody) { v.applyMatrix4(toBody); nrm.applyMatrix3(m3).normalize(); }
          const o3 = (vo + k) * 3;
          P[o3] = v.x; P[o3 + 1] = v.y; P[o3 + 2] = v.z;
          N[o3] = nrm.x; N[o3 + 1] = nrm.y; N[o3 + 2] = nrm.z;
          bbMin.min(v); bbMax.max(v);
          UV[(vo + k) * 2] = gu.getX(k); UV[(vo + k) * 2 + 1] = gu.getY(k);
          C[o3] = gc.getX(k); C[o3 + 1] = gc.getY(k); C[o3 + 2] = gc.getZ(k);
          A[(vo + k) * 4] = ga.getX(k); A[(vo + k) * 4 + 1] = ga.getY(k); A[(vo + k) * 4 + 2] = ga.getZ(k); A[(vo + k) * 4 + 3] = ga.getW(k);
          F[(vo + k) * 2] = gf.getX(k); F[(vo + k) * 2 + 1] = gf.getY(k);
          const o4 = (vo + k) * 4;
          if (c.wfn) {
            const ws = c.wfn([v.x, v.y, v.z]).filter((w) => w[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
            let tot = 0; for (const w of ws) tot += w[1];
            for (let q = 0; q < 4; q++) { SI[o4 + q] = ws[q]?.[0] ?? 0; SW[o4 + q] = ws[q] ? ws[q][1] / (tot || 1) : 0; }
            if (!ws.length) SW[o4] = 1;
            dom[vo + k] = SI[o4];
          } else { SI[o4] = c.bone; SW[o4] = 1; dom[vo + k] = c.bone; }
        }
        const gi = g.getIndex()!;
        for (let k = 0; k < gi.count; k++) I[io + k] = gi.getX(k) + vo;
        vo += gp.count; io += gi.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
      geo.setAttribute('aAtlas', new THREE.BufferAttribute(A, 4));
      geo.setAttribute('aFx', new THREE.BufferAttribute(F, 2));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
      geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
      const mat = this.mats[key] ?? this.mats.n;
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.name = 'skin:' + key;
      mesh.castShadow = key !== 'g'; mesh.receiveShadow = key !== 'g';
      mesh.bind(skeleton, new THREE.Matrix4());
      mesh.boundingBox = new THREE.Box3();   // empty: measurements come from the proxies
      (mesh as any).clone = () => new THREE.Group();
      // skins on the root stay drawn when the view hides the body (eyes in the dark)
      (o.onRoot?.includes(key) ? rig.root : body).add(mesh);
      rig.skins[key] = mesh;
      // proxies: one per bone with triangles, carrying its bounds and rebuilding its triangles on clone()
      const tri = I.length / 3;
      const byBone = new Map<number, number[]>();
      for (let t = 0; t < tri; t++) {
        const a = I[t * 3], b = I[t * 3 + 1], c2 = I[t * 3 + 2];
        const d = dom[a] === dom[b] || dom[a] === dom[c2] ? dom[a] : dom[b] === dom[c2] ? dom[b] : dom[a];
        let l = byBone.get(d); if (!l) byBone.set(d, l = []); l.push(t);
      }
      for (const [bi, tris] of byBone) {
        const im = inv[bi];
        const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        for (const t of tris) for (let q = 0; q < 3; q++) { const k = I[t * 3 + q]; v.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).applyMatrix4(im); lo.min(v); hi.max(v); }
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.Float32BufferAttribute([lo.x, lo.y, lo.z, hi.x, hi.y, hi.z], 3));
        const proxy = new THREE.Mesh(pg, mat);
        proxy.name = 'proxy:' + this.bones[bi].name + ':' + key;
        proxy.visible = false;
        let built: THREE.BufferGeometry | null = null;
        (proxy as any).clone = () => {
          if (!built) built = extract(geo, tris, im, I);
          const mm = new THREE.Mesh(built, mat);
          mm.castShadow = true;
          return mm;
        };
        this.bones[bi].add(proxy);
      }
    }
    // generous bounds for culling (bones move far from the rest pose)
    const c = bbMin.clone().add(bbMax).multiplyScalar(0.5), rad = bbMin.distanceTo(bbMax) * 0.5;
    const sphere = o.sphere ? new THREE.Sphere(new THREE.Vector3(o.sphere[0], o.sphere[1], o.sphere[2]), o.sphere[3]) : new THREE.Sphere(c, rad * 1.6 + 0.4);
    for (const s of Object.values(rig.skins)) s.boundingSphere = sphere;
    return rig;
  }
}

/** static copy of some triangles of a skinned geometry, in a bone's local frame */
function extract(src: THREE.BufferGeometry, tris: number[], inv: THREE.Matrix4, I: number[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'color', 'aAtlas', 'aFx'];
  const out: Record<string, number[]> = {};
  for (const n of names) out[n] = [];
  const map = new Map<number, number>();
  const idx: number[] = [];
  const v = new THREE.Vector3(), m3 = new THREE.Matrix3().getNormalMatrix(inv);
  for (const t of tris) for (let q = 0; q < 3; q++) {
    const k = I[t * 3 + q];
    let ni = map.get(k);
    if (ni === undefined) {
      ni = map.size; map.set(k, ni);
      for (const n of names) {
        const at = src.getAttribute(n) as THREE.BufferAttribute;
        if (n === 'position') { v.fromBufferAttribute(at, k).applyMatrix4(inv); out[n].push(v.x, v.y, v.z); }
        else if (n === 'normal') { v.fromBufferAttribute(at, k).applyMatrix3(m3).normalize(); out[n].push(v.x, v.y, v.z); }
        else for (let c = 0; c < at.itemSize; c++) out[n].push(at.getComponent(k, c));
      }
    }
    idx.push(ni);
  }
  const g = new THREE.BufferGeometry();
  for (const n of names) g.setAttribute(n, new THREE.Float32BufferAttribute(out[n], (src.getAttribute(n) as THREE.BufferAttribute).itemSize));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// ====================================================================== animation helpers
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
/** frame-rate independent exponential approach */
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
/** move toward b by at most rate*dt */
export const approach = (a: number, b: number, rate: number, dt: number) => (a < b ? Math.min(b, a + rate * dt) : Math.max(b, a - rate * dt));
export const wrapPi = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** a part that is gone: cut off at death (gore, c.mem.sev) or lost while alive (c.mem.severed) */
export function isLost(c: Creature, name: string): boolean {
  const a = c.mem.severed as string[] | undefined, b = c.mem.sev as string[] | undefined;
  return !!(a && a.includes(name)) || !!(b && b.includes(name));
}

/**
 * Attack timeline from the manager's attackPhase (0.38 s wind-up then the
 * hit; clients see a shorter 0.2): wind 0→1 while winding, rec 1→0 during
 * the follow-through after the strike.
 */
export function atkCurve(c: Creature, dt: number, recDur = 0.5): { wind: number; rec: number } {
  const m = c.mem;
  if (c.attackPhase > 0) {
    if (!m._atkOn) { m._atkOn = 1; m._atkLen = Math.max(0.12, c.attackPhase); }
    m._atkRec = 0;
    return { wind: clamp01(1 - c.attackPhase / m._atkLen), rec: 0 };
  }
  if (m._atkOn) { m._atkOn = 0; m._atkRec = recDur; }
  m._atkRec = Math.max(0, (m._atkRec ?? 0) - dt);
  return { wind: 0, rec: (m._atkRec ?? 0) / recDur };
}

/** anticipation / strike shaping of a wind value: -1 (pulled back) .. +1 (struck) */
export function strikeShape(wind: number, rec: number): number {
  if (wind > 0) return wind < 0.62 ? -Math.sin((wind / 0.62) * Math.PI * 0.5) : -1 + 2 * smooth01((wind - 0.62) / 0.38);
  return rec > 0 ? Math.pow(rec, 0.6) : 0;
}

/** hit flinch 0..1 (manager sets hitFlash = 0.15 on damage) */
export const flinchOf = (c: Creature) => clamp01(c.hitFlash / 0.15);

/**
 * Planar two-bone IK. From the root, reach the target (dx forward, dy up) with
 * bones l1, l2. Returns [a1, a2]: a1 the first bone's angle from +dx toward +dy,
 * a2 the second bone's angle relative to the first (bend > 0 bends toward -dy side
 * when bend = 1).
 */
export function ik2(dx: number, dy: number, l1: number, l2: number, bend = 1): [number, number] {
  let d = Math.hypot(dx, dy);
  d = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(l1 + l2 - 1e-4, d));
  const base = Math.atan2(dy, dx);
  const c1 = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, c1)));
  const c2 = (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2);
  const b = Math.acos(Math.max(-1, Math.min(1, c2)));
  return [base + a * bend, -(Math.PI - b) * bend];
}

/** world → creature-local (root frame) for a point on the ground */
export function toLocal(rootX: number, rootZ: number, rootRotY: number, wx: number, wz: number): [number, number] {
  const dx = wx - rootX, dz = wz - rootZ;
  const c = Math.cos(-rootRotY), s = Math.sin(-rootRotY);
  return [dx * c + dz * s, -dx * s + dz * c];
}
/** creature-local → world */
export function toWorld(rootX: number, rootZ: number, rootRotY: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(rootRotY), s = Math.sin(rootRotY);
  return [rootX + lx * c + lz * s, rootZ - lx * s + lz * c];
}
