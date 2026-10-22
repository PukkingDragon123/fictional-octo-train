// Faceted low-poly modelling kit for the subject room. Every part is built
// from chamfered hulls, few-sided lathes, bevelled extrusions and faceted
// tubes (never a bare primitive), made non-indexed with flat normals, given
// box-projected UVs in the part's own space (so wood grain follows a plank,
// tiles stay square on a wall) and a per-facet tone so every face reads as a
// separate hand-painted plane. A builder merges parts per material: a whole
// machine is a handful of draw calls.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FKey, FMats } from './pixtex';
import { REP } from './pixtex';

type V3 = [number, number, number];
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();

/** a transform: position, rotation (radians, XYZ), scale (number or [x,y,z]) */
export function at(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s: number | V3 = 1): THREE.Matrix4 {
  E.set(rx, ry, rz); Q.setFromEuler(E); V.set(x, y, z);
  if (typeof s === 'number') S.set(s, s, s); else S.set(s[0], s[1], s[2]);
  return M.clone().compose(V, Q, S);
}
/** a transform that lays local +Y along the segment a→b (length of the part is up to you) */
export function along(a: V3, b: V3, roll = 0): THREE.Matrix4 {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  return new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
}

const hash = (a: number, b: number, c: number) => { const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); };

/** flat-shaded, non-indexed copy with only position (+normal) kept */
export function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  geo.computeVertexNormals();
  return geo;
}
/** nudge every vertex by a hash of where it is (shared corners move together: no cracks) */
export function jitter(g: THREE.BufferGeometry, amt: number, seed = 1): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const kx = Math.round(x * 1000), ky = Math.round(y * 1000), kz = Math.round(z * 1000);
    p.setXYZ(i, x + (hash(kx, ky, kz + seed) - 0.5) * amt, y + (hash(ky, kz, kx + seed * 3) - 0.5) * amt, z + (hash(kz, kx, ky + seed * 7) - 0.5) * amt);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ shapes
/** convex hull of points */
export function hull(pts: V3[]): THREE.BufferGeometry {
  return flat(new ConvexGeometry(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))));
}
/** a box with every edge chamfered (c), centred; taper narrows the top (0..1), skew shifts the top in x */
export function cbox(w: number, h: number, d: number, c = Math.min(w, h, d) * 0.18, taper = 0, skew = 0): THREE.BufferGeometry {
  c = Math.min(c, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const pts: V3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const k = sy > 0 ? 1 - taper : 1, ox = sy > 0 ? skew : 0;
    const X = (w / 2) * k, Y = h / 2, Z = (d / 2) * k;
    pts.push([sx * X + ox, sy * (Y - c), sz * (Z - c * k)], [sx * (X - c * k) + ox, sy * Y, sz * (Z - c * k)], [sx * (X - c * k) + ox, sy * (Y - c), sz * Z]);
  }
  return hull(pts);
}
/** a turned profile [radius, y][] with few sides (faceted), phase rotates the facets */
export function lathe(profile: [number, number][], n = 8, phase = 0.5): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), n, (phase * Math.PI * 2) / n);
  return flat(g);
}
/** a faceted cylinder centred on the origin along Y, edges chamfered by c */
export function prism(r: number, h: number, n = 8, o: { rTop?: number; c?: number; phase?: number } = {}): THREE.BufferGeometry {
  const rt = o.rTop ?? r, c = Math.min(o.c ?? Math.min(r, rt) * 0.18, h * 0.3);
  const p: [number, number][] = c > 1e-4
    ? [[0, -h / 2], [r - c, -h / 2], [r, -h / 2 + c], [rt, h / 2 - c], [rt - c, h / 2], [0, h / 2]]
    : [[0, -h / 2], [r, -h / 2], [rt, h / 2], [0, h / 2]];
  return lathe(p, n, o.phase ?? 0.5);
}
/** an extruded 2D outline (XY), depth along Z centred, bevel = chamfer size; holes are inner outlines */
export function extrude(pts: [number, number][], depth: number, bevel = 0, holes: [number, number][][] = []): THREE.BufferGeometry {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hpts of holes) s.holes.push(new THREE.Path(hpts.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2 + bevel);
  return flat(g);
}
/** a regular polygon outline (n sides, radius r, rotated by phase of a side) */
export function ngon(r: number, n: number, phase = 0.5, sx = 1, sy = 1): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) { const a = ((i + phase) / n) * Math.PI * 2; out.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]); }
  return out;
}
/** a faceted tube through points (lightly smoothed), radial sides */
export function tube(pts: V3[], r: number, segs = 10, radial = 5, smooth = true): THREE.BufferGeometry {
  const vs = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = smooth && vs.length > 2 ? new THREE.CatmullRomCurve3(vs, false, 'centripetal') : new THREE.CatmullRomCurve3(vs, false, 'catmullrom', 0);
  return flat(new THREE.TubeGeometry(curve, segs, r, radial, false));
}
/** a strap / band loop: an n-gon ring of width h (along Y) and thickness t, radii rx, rz */
export function band(rx: number, rz: number, h: number, t: number, n = 10, arc = 1, phase = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const seg = Math.max(1, Math.round(n * arc));
  const P = (i: number, r: number, y: number): V3 => { const a = phase + (i / n) * Math.PI * 2; return [Math.sin(a) * (rx + r), y, Math.cos(a) * (rz + r)]; };
  const quad = (a: V3, b: V3, c: V3, d: V3) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < seg; i++) {
    const o0 = P(i, t / 2, -h / 2), o1 = P(i + 1, t / 2, -h / 2), o2 = P(i + 1, t / 2, h / 2), o3 = P(i, t / 2, h / 2);
    const i0 = P(i, -t / 2, -h / 2), i1 = P(i + 1, -t / 2, -h / 2), i2 = P(i + 1, -t / 2, h / 2), i3 = P(i, -t / 2, h / 2);
    quad(o0, o1, o2, o3); quad(i1, i0, i3, i2); quad(o3, o2, i2, i3); quad(i0, i1, o1, o0);
    if (arc < 1 && i === 0) quad(i0, o0, o3, i3);
    if (arc < 1 && i === seg - 1) quad(o1, i1, i2, o2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** a cut gem / bipyramid (lamps, rivets, bolt heads when squashed) */
export function gem(r: number, n = 6, h = r, crown = 0.35): THREE.BufferGeometry {
  return lathe([[0, -h], [r, -h * 0.1], [r * 0.82, h * crown], [r * 0.4, h * 0.62], [0, h * 0.66]], n, 0.5);
}
/** a hex bolt head / nut lying in XZ, up +Y */
export const bolt = (r: number, h = r * 0.55) => lathe([[0, 0], [r, 0], [r, h * 0.7], [r * 0.7, h], [0, h]], 6, 0.5);
/** a star outline (saw blades, cogs) with an optional n-gon hole */
export function starGeo(rOut: number, rIn: number, n: number, depth: number, hole = 0, hook = 0.35): THREE.BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + hook) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    pts.push([Math.cos(a0) * rIn, Math.sin(a0) * rIn], [Math.cos(a1) * rOut, Math.sin(a1) * rOut], [Math.cos(a2 - 0.001) * rIn * 1.0, Math.sin(a2 - 0.001) * rIn]);
  }
  return extrude(pts, depth, 0, hole ? [ngon(hole, 8, 0).reverse()] : []);
}

// ------------------------------------------------------------------ builder
export interface AddOpts {
  /** metres per texture repeat (defaults per material) */
  rep?: number;
  /** which local axis the texture's V (grain) follows */
  grain?: 'x' | 'y' | 'z';
  /** per-facet tone spread */
  tone?: number;
  /** darken toward the floor: world y below which it starts, strength */
  ao?: number;
  seed?: number;
  /** fixed texture offset instead of a random one (straps: [0, 0.5] puts the stitching on the edges) */
  uv0?: [number, number];
}
let seedN = 1;

export class FacetBuilder {
  private parts = new Map<FKey, THREE.BufferGeometry[]>();
  /** add a part: geometry (consumed), colour multiplier, transform */
  add(key: FKey, g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4, o: AddOpts = {}) {
    const geo = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const n = p.count;
    const seed = o.seed ?? seedN++;
    const rep = o.rep ?? REP[key] ?? 0.5;
    const grain = o.grain ?? 'y';
    const uv = new Float32Array(n * 2);
    const tone = o.tone ?? 0.14;
    const toneF = new Float32Array(n);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
    const ou = o.uv0 ? o.uv0[0] : hash(seed, 1, 2), ov = o.uv0 ? o.uv0[1] : hash(seed, 3, 4);
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      nn.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
      const dom = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
      // the two in-plane axes: V follows the grain axis when it lies in the plane
      let uA: 'x' | 'y' | 'z', vA: 'x' | 'y' | 'z';
      const rest = (['x', 'y', 'z'] as const).filter((k) => k !== dom);
      if (rest.includes(grain)) { vA = grain; uA = rest.find((k) => k !== grain)!; } else { uA = rest[0]; vA = rest[1]; }
      const flip = (dom === 'x' ? nn.x : dom === 'y' ? nn.y : nn.z) < 0 ? -1 : 1;
      const t = 1 + (hash(Math.round(nn.x * 9), Math.round(nn.y * 9), Math.round(nn.z * 9) + seed) - 0.5) * tone * 2;
      for (let k = 0; k < 3; k++) {
        const v = k === 0 ? a : k === 1 ? b : c;
        uv[(i + k) * 2] = (v[uA] * flip) / rep + ou;
        uv[(i + k) * 2 + 1] = v[vA] / rep + ov;
        toneF[i + k] = t;
      }
    }
    if (m) geo.applyMatrix4(m);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const col = new Float32Array(n * 3);
    const cc = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      let f = toneF[i];
      if (o.ao !== undefined) { const y = p.getY(i); f *= y < o.ao ? 0.45 + 0.55 * Math.max(0, y / o.ao) : 1; }
      col[i * 3] = cc.r * f; col[i * 3 + 1] = cc.g * f; col[i * 3 + 2] = cc.b * f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    let list = this.parts.get(key);
    if (!list) { list = []; this.parts.set(key, list); }
    list.push(geo);
    return this;
  }
  get empty() { return this.parts.size === 0; }
  /** one mesh per material; shadows on by default */
  build(mats: FMats, shadows: { cast?: boolean; receive?: boolean } = {}): THREE.Group {
    const g = new THREE.Group();
    for (const [k, list] of this.parts) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[k]);
      mesh.name = k;
      const emissive = k === 'lamp' || k === 'glass' || k === 'screen';
      mesh.castShadow = !emissive && (shadows.cast ?? true);
      mesh.receiveShadow = !emissive && (shadows.receive ?? true);
      g.add(mesh);
    }
    this.parts.clear();
    return g;
  }
}
