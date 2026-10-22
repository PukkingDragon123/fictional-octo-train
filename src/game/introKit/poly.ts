// Low-poly modelling helpers for the intake set (src/game/introSet.ts) and its
// props: every shape is a faceted polygon solid built face by face on a
// ModelBuilder (so the builder's transform stack, atlas textures and vertex
// colours all still apply), never a bare primitive.
//
//   face()    a convex polygon, planar-projected world-scale UVs, flat normal
//   cbox()    a chamfered box: 6 faces, 12 bevel strips, 8 corner facets
//   lathe()   a profile revolved with few segments (flat-shaded quads)
//   prism()   a polygon outline extruded along z, with a chamfered rim
//   tube()    a polygon cross-section swept along a path (pipes, cables, hoses)
//   facetize() split a built geometry into flat triangles and jitter its
//              vertices (by position hash, so shared corners stay welded):
//              irregular silhouettes, visible facets
//
// All solids orient their faces outward automatically.
import * as THREE from 'three';
import type { ModelBuilder, TexSpec } from '../../gfx/modelBuilder';
import { atlas } from '../../gfx/atlas';

export type V3 = [number, number, number];
export type V2 = [number, number];
export interface PolyOpts { color?: number; emissive?: number; shade?: number; uvScale?: number; fit?: boolean; uvOff?: V2 }

const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tN = new THREE.Vector3(), tU = new THREE.Vector3(), tV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

function texOf(spec: TexSpec, n: THREE.Vector3): string {
  if (typeof spec === 'string') return spec;
  const ay = Math.abs(n.y), ax = Math.abs(n.x), az = Math.abs(n.z);
  let k: string;
  if (ay >= ax && ay >= az) k = n.y > 0 ? 'top' : 'bottom';
  else if (az >= ax) k = n.z > 0 ? 'south' : 'north';
  else k = n.x > 0 ? 'east' : 'west';
  const s = spec as Record<string, string | undefined>;
  return s[k] ?? (k !== 'top' && k !== 'bottom' ? s.sides : undefined) ?? s.all ?? 'white';
}

/** normal of a polygon (Newell) */
function newell(p: V3[], out: THREE.Vector3) {
  out.set(0, 0, 0);
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    out.x += (a[1] - b[1]) * (a[2] + b[2]);
    out.y += (a[2] - b[2]) * (a[0] + b[0]);
    out.z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return out.normalize();
}

/**
 * A convex polygon (any winding). `out` (a point the face should look away
 * from, or a direction with `dir`) orients it; without it the given winding
 * (counter-clockwise from the front) is kept. UVs are planar, world scale.
 */
export function face(mb: ModelBuilder, p: V3[], tex: TexSpec, o: PolyOpts = {}, out?: V3, dir = false) {
  if (p.length < 3) return;
  newell(p, tN);
  if (tN.lengthSq() < 1e-12) return;
  if (out) {
    let cx = 0, cy = 0, cz = 0;
    for (const q of p) { cx += q[0]; cy += q[1]; cz += q[2]; }
    cx /= p.length; cy /= p.length; cz /= p.length;
    const d = dir ? tN.x * out[0] + tN.y * out[1] + tN.z * out[2] : tN.x * (cx - out[0]) + tN.y * (cy - out[1]) + tN.z * (cz - out[2]);
    if (d < 0) { p = p.slice().reverse(); tN.negate(); }
  }
  const t = texOf(tex, tN);
  const r = atlas().get(t);
  // planar projection: u along the horizontal tangent, v up the face (floors: x / z)
  if (Math.abs(tN.y) > 0.75) { tU.set(1, 0, 0); tV.set(0, 0, tN.y > 0 ? -1 : 1); }
  else { tU.crossVectors(UP, tN).normalize(); if (tU.lengthSq() < 1e-6) tU.crossVectors(FWD, tN).normalize(); tV.crossVectors(tN, tU).normalize(); }
  const us = o.uvScale ?? 1;
  const [ou, ov] = o.uvOff ?? [0, 0];
  let uvs: number[][];
  if (o.fit) {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    const raw = p.map((q) => { const u = q[0] * tU.x + q[1] * tU.y + q[2] * tU.z, v = q[0] * tV.x + q[1] * tV.y + q[2] * tV.z; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); return [u, v]; });
    uvs = raw.map(([u, v]) => [(u - u0) / Math.max(1e-6, u1 - u0), (v - v0) / Math.max(1e-6, v1 - v0)]);
  } else uvs = p.map((q) => [((q[0] * tU.x + q[1] * tU.y + q[2] * tU.z) + ou) / r.mw * us, ((q[0] * tV.x + q[1] * tV.y + q[2] * tV.z) + ov) / r.mh * us]);
  // cheap baked light: faces turned up are a touch brighter, faces turned down darker
  const shade = (o.shade ?? 1) * (0.78 + 0.22 * (tN.y * 0.5 + 0.5));
  const n = [tN.x, tN.y, tN.z];
  const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
  if (p.length === 3) { mb.triRaw(p, uvs, t, c, shade, e); return; }
  if (p.length === 4) { mb.quadRaw(p, uvs, t, c, shade, e, 0, n); return; }
  for (let i = 1; i < p.length - 1; i++) mb.triRaw([p[0], p[i], p[i + 1]], [uvs[0], uvs[i], uvs[i + 1]], t, c, shade, e);
}

/**
 * A chamfered box: centre x / z, bottom y, size w h d, bevel b (clamped).
 * The 26 faces catch light at different angles: crisp low-poly edges.
 */
export function cbox(mb: ModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, b: number, tex: TexSpec, o: PolyOpts = {}) {
  b = Math.max(0, Math.min(b, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const cx = x, cy = y + h / 2, cz = z;
  const X = w / 2, Y = h / 2, Z = d / 2;
  const P = (sx: number, sy: number, sz: number): V3 => [cx + sx, cy + sy, cz + sz];
  const C: V3 = [cx, cy, cz];
  if (b <= 1e-4) {
    for (const s of [-1, 1]) {
      face(mb, [P(s * X, -Y, -Z), P(s * X, Y, -Z), P(s * X, Y, Z), P(s * X, -Y, Z)], tex, o, C);
      face(mb, [P(-X, s * Y, -Z), P(X, s * Y, -Z), P(X, s * Y, Z), P(-X, s * Y, Z)], tex, o, C);
      face(mb, [P(-X, -Y, s * Z), P(X, -Y, s * Z), P(X, Y, s * Z), P(-X, Y, s * Z)], tex, o, C);
    }
    return;
  }
  const x1 = X - b, y1 = Y - b, z1 = Z - b;
  for (const s of [-1, 1]) {
    // main faces
    face(mb, [P(s * X, -y1, -z1), P(s * X, y1, -z1), P(s * X, y1, z1), P(s * X, -y1, z1)], tex, o, C);
    face(mb, [P(-x1, s * Y, -z1), P(x1, s * Y, -z1), P(x1, s * Y, z1), P(-x1, s * Y, z1)], tex, o, C);
    face(mb, [P(-x1, -y1, s * Z), P(x1, -y1, s * Z), P(x1, y1, s * Z), P(-x1, y1, s * Z)], tex, o, C);
  }
  // edge strips
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) face(mb, [P(sx * X, sy * y1, -z1), P(sx * x1, sy * Y, -z1), P(sx * x1, sy * Y, z1), P(sx * X, sy * y1, z1)], tex, o, C);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) face(mb, [P(sx * X, -y1, sz * z1), P(sx * x1, -y1, sz * Z), P(sx * x1, y1, sz * Z), P(sx * X, y1, sz * z1)], tex, o, C);
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) face(mb, [P(-x1, sy * Y, sz * z1), P(-x1, sy * y1, sz * Z), P(x1, sy * y1, sz * Z), P(x1, sy * Y, sz * z1)], tex, o, C);
  // corners
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) face(mb, [P(sx * X, sy * y1, sz * z1), P(sx * x1, sy * Y, sz * z1), P(sx * x1, sy * y1, sz * Z)], tex, o, C);
}

/** a chamfered box between two corners */
export function cboxMM(mb: ModelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number, tex: TexSpec, o: PolyOpts = {}) {
  cbox(mb, (x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), b, tex, o);
}

/**
 * Revolve a profile [radius, y][] (bottom to top) about the vertical axis at
 * (x, y, z) with `segs` facets. Ends with r > 0 get capped. `phase` turns the
 * facets (a flat facing the camera reads better than an edge). Each quad is
 * flat-shaded: a few segments make a properly faceted turned part.
 */
export function lathe(mb: ModelBuilder, x: number, y: number, z: number, prof: V2[], segs: number, tex: TexSpec, o: PolyOpts & { phase?: number; caps?: boolean; sx?: number; sz?: number } = {}) {
  const ph = o.phase ?? Math.PI / segs, sx = o.sx ?? 1, sz = o.sz ?? 1;
  const ring = (r: number, yy: number, i: number): V3 => { const a = ph + (i / segs) * Math.PI * 2; return [x + Math.cos(a) * r * sx, y + yy, z + Math.sin(a) * r * sz]; };
  for (let k = 0; k < prof.length - 1; k++) {
    const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
    if (r0 < 1e-5 && r1 < 1e-5) continue;
    const dr = r1 - r0, dy = y1 - y0;
    for (let i = 0; i < segs; i++) {
      const am = ph + ((i + 0.5) / segs) * Math.PI * 2;
      // outward in the profile plane: (dy, -dr) rotated to this facet's angle
      const od: V3 = [Math.cos(am) * dy, -dr, Math.sin(am) * dy];
      const q: V3[] = [];
      if (r0 > 1e-5) q.push(ring(r0, y0, i), ring(r0, y0, i + 1)); else q.push(ring(0, y0, i));
      if (r1 > 1e-5) q.push(ring(r1, y1, i + 1), ring(r1, y1, i)); else q.push(ring(0, y1, i));
      face(mb, q, tex, o, od, true);
    }
  }
  if (o.caps !== false) {
    const [rb, yb] = prof[0], [rt, yt] = prof[prof.length - 1];
    if (rb > 1e-5) face(mb, Array.from({ length: segs }, (_, i) => ring(rb, yb, i)), tex, o, [0, -1, 0], true);
    if (rt > 1e-5) face(mb, Array.from({ length: segs }, (_, i) => ring(rt, yt, i)), tex, o, [0, 1, 0], true);
  }
}

/** a faceted cylinder along an arbitrary axis from a to b (a lathe of two rings, capped) */
export function rod(mb: ModelBuilder, a: V3, b: V3, r: number, segs: number, tex: TexSpec, o: PolyOpts & { r2?: number; caps?: boolean } = {}) {
  tA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = tA.length();
  if (L < 1e-6) return;
  tA.divideScalar(L);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, tA);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(1, 1, 1));
  mb.push().matrix(m);
  lathe(mb, 0, 0, 0, [[r, 0], [o.r2 ?? r, L]], segs, tex, { ...o, caps: o.caps });
  mb.pop();
}

/** offset a closed 2D polygon (counter-clockwise) inward by d (mitred) */
export function inset(pts: V2[], d: number): V2[] {
  const n = pts.length, out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    let ax = p1[0] - p0[0], ay = p1[1] - p0[1]; let la = Math.hypot(ax, ay) || 1; ax /= la; ay /= la;
    let bx = p2[0] - p1[0], by = p2[1] - p1[1]; let lb = Math.hypot(bx, by) || 1; bx /= lb; by /= lb;
    // inward normals of a CCW polygon: (-y, x)
    const nax = -ay, nay = ax, nbx = -by, nby = bx;
    let mx = nax + nbx, my = nay + nby; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const cs = Math.max(0.35, mx * nax + my * nay);
    out.push([p1[0] + mx * d / cs, p1[1] + my * d / cs]);
    void la; void lb;
  }
  return out;
}
const area2 = (p: V2[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };

/**
 * Extrude a polygon outline (x, y; any winding, may be concave) along z from
 * z0 to z1, with a chamfer b round the front and back rims.
 */
export function prism(mb: ModelBuilder, outline: V2[], z0: number, z1: number, tex: TexSpec, o: PolyOpts & { b?: number; back?: boolean } = {}) {
  let pts = outline.slice();
  if (area2(pts) < 0) pts.reverse();
  const b = Math.min(o.b ?? 0, Math.abs(z1 - z0) / 2 - 1e-4);
  const inner = b > 0 ? inset(pts, b) : pts;
  const zf = z1, zb = z0;
  const tri = THREE.ShapeUtils.triangulateShape(inner.map(([px, py]) => new THREE.Vector2(px, py)), []);
  const cz = (z0 + z1) / 2;
  // caps
  for (const [zz, nz, show] of [[zf, 1, true], [zb, -1, o.back !== false]] as [number, number, boolean][]) {
    if (!show) continue;
    for (const [i, j, k] of tri) face(mb, [[inner[i][0], inner[i][1], zz], [inner[j][0], inner[j][1], zz], [inner[k][0], inner[k][1], zz]], tex, o, [0, 0, nz], true);
  }
  // sides (and bevels)
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[(i + 1) % n];
    // outward of a CCW polygon edge: (dy, -dx)
    const ox = c[1] - a[1], oy = -(c[0] - a[0]);
    const od: V3 = [ox, oy, 0];
    face(mb, [[a[0], a[1], zb + b], [c[0], c[1], zb + b], [c[0], c[1], zf - b], [a[0], a[1], zf - b]], tex, o, od, true);
    if (b > 0) {
      const ia = inner[i], ic = inner[(i + 1) % n];
      face(mb, [[a[0], a[1], zf - b], [c[0], c[1], zf - b], [ic[0], ic[1], zf], [ia[0], ia[1], zf]], tex, o, [ox, oy, Math.hypot(ox, oy)], true);
      if (o.back !== false) face(mb, [[a[0], a[1], zb + b], [c[0], c[1], zb + b], [ic[0], ic[1], zb], [ia[0], ia[1], zb]], tex, o, [ox, oy, -Math.hypot(ox, oy)], true);
    }
  }
  void cz;
}

/** sweep a regular polygon of radius r along a path: pipes, cables, hoses */
export function tube(mb: ModelBuilder, path: V3[], r: number, segs: number, tex: TexSpec, o: PolyOpts & { caps?: boolean; r1?: number } = {}) {
  if (path.length < 2) return;
  const P = path.map((p) => new THREE.Vector3(...p));
  const T: THREE.Vector3[] = P.map((_, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  // parallel-transported frames
  const N0 = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N0.sub(T[0].clone().multiplyScalar(N0.dot(T[0]))).normalize();
  const Ns = [N0];
  for (let i = 1; i < P.length; i++) {
    const n = Ns[i - 1].clone();
    n.sub(T[i].clone().multiplyScalar(n.dot(T[i]))).normalize();
    Ns.push(n);
  }
  const rings: V3[][] = P.map((p, i) => {
    const n = Ns[i], bn = new THREE.Vector3().crossVectors(T[i], n);
    const rr = o.r1 !== undefined ? r + (o.r1 - r) * (i / (P.length - 1)) : r;
    return Array.from({ length: segs }, (_, k) => {
      const a = (k / segs) * Math.PI * 2 + Math.PI / segs;
      return [p.x + (n.x * Math.cos(a) + bn.x * Math.sin(a)) * rr, p.y + (n.y * Math.cos(a) + bn.y * Math.sin(a)) * rr, p.z + (n.z * Math.cos(a) + bn.z * Math.sin(a)) * rr] as V3;
    });
  });
  for (let i = 0; i < P.length - 1; i++) {
    const c = P[i].clone().add(P[i + 1]).multiplyScalar(0.5);
    for (let k = 0; k < segs; k++) face(mb, [rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]], tex, o, [c.x, c.y, c.z]);
  }
  if (o.caps !== false) {
    face(mb, rings[0], tex, o, [-T[0].x, -T[0].y, -T[0].z], true);
    const L = P.length - 1;
    face(mb, rings[L], tex, o, [T[L].x, T[L].y, T[L].z], true);
  }
}

/** a sagging cable from a to b (catenary-ish), drop metres at the middle */
export function sag(a: V3, b: V3, drop: number, n = 8): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * drop, a[2] + (b[2] - a[2]) * t]); }
  return out;
}

/** an irregular faceted lump (rubble, a bundle): a jittered low-res lathe */
export function lump(mb: ModelBuilder, x: number, y: number, z: number, r: number, h: number, seed: number, tex: TexSpec, o: PolyOpts = {}) {
  const rnd = mulberry(seed);
  const segs = 7, rows = 4;
  const ring: V3[][] = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, ry = Math.sin(v * Math.PI) * r, yy = y + (1 - Math.cos(v * Math.PI)) * h / 2;
    ring.push(Array.from({ length: segs }, (_, i) => { const a = (i / segs) * Math.PI * 2 + rnd() * 0.4; const k = 0.75 + rnd() * 0.45; return [x + Math.cos(a) * ry * k, yy + (rnd() - 0.5) * h * 0.08, z + Math.sin(a) * ry * k] as V3; }));
  }
  const C: V3 = [x, y + h / 2, z];
  for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) {
    const a = ring[j][i], b = ring[j][(i + 1) % segs], c = ring[j + 1][(i + 1) % segs], d = ring[j + 1][i];
    face(mb, [a, b, c], tex, o, C); face(mb, [a, c, d], tex, o, C);
  }
}

export function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const hp = (x: number, y: number, z: number, s: number) => { let h = Math.imul(Math.round(x * 997) ^ Math.imul(Math.round(y * 991), 0x9e3779b1) ^ Math.imul(Math.round(z * 983), 0x85ebca6b) ^ s, 0x27d4eb2d); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return ((h >>> 0) / 4294967296) - 0.5; };

/**
 * Turn a built geometry into flat triangles and jitter every vertex by a hash
 * of where it is (corners shared between faces move together, so nothing
 * cracks): every quad becomes two facets catching the light differently.
 * amp metres; `keepY` leaves heights alone (floors stay flat).
 */
export function facetize(g: THREE.BufferGeometry, amp = 0.01, seed = 1, keepY = false): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  const P = ng.getAttribute('position') as THREE.BufferAttribute, N = ng.getAttribute('normal') as THREE.BufferAttribute;
  if (amp > 0) for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    P.setXYZ(i, x + hp(x, y, z, seed) * amp, keepY ? y : y + hp(x, y, z, seed + 7) * amp, z + hp(x, y, z, seed + 13) * amp);
  }
  for (let i = 0; i < P.count; i += 3) {
    tA.set(P.getX(i + 1) - P.getX(i), P.getY(i + 1) - P.getY(i), P.getZ(i + 1) - P.getZ(i));
    tB.set(P.getX(i + 2) - P.getX(i), P.getY(i + 2) - P.getY(i), P.getZ(i + 2) - P.getZ(i));
    tN.crossVectors(tA, tB);
    if (tN.lengthSq() < 1e-14) continue;
    tN.normalize();
    // keep the original side (a jitter never flips a face)
    if (tN.x * N.getX(i) + tN.y * N.getY(i) + tN.z * N.getZ(i) < 0) tN.negate();
    for (let k = 0; k < 3; k++) N.setXYZ(i + k, tN.x, tN.y, tN.z);
  }
  P.needsUpdate = true; N.needsUpdate = true;
  ng.computeBoundingSphere(); ng.computeBoundingBox();
  return ng;
}

/** merge several built geometries with the same attribute layout into one (draw calls) */
export function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'color', 'aAtlas', 'aFx'];
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const first = parts[0].getAttribute(n) as THREE.BufferAttribute | undefined;
    if (!first) continue;
    const size = first.itemSize;
    let total = 0; for (const p of parts) total += (p.getAttribute(n) as THREE.BufferAttribute).count;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const p of parts) { const a = p.getAttribute(n) as THREE.BufferAttribute; arr.set(a.array as Float32Array, off); off += a.count * size; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
