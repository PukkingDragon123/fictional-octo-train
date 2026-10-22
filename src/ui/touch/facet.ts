// Faceted low-poly building blocks for every physical HUD object (touch
// controls, the body HUD shelf, the watch, the close-up props): never a bare
// primitive. Cylinders are few-sided lathes with chamfered rims, boxes are
// convex hulls with bevelled edges and corner facets, balls are jittered
// icosahedra, rings are 4-sided tubes, plates are extruded polygons with a
// one-step bevel. Every geometry comes back non-indexed with one normal per
// triangle, so flat shading shows each facet as its own plane of colour.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

const PI = Math.PI;

/** fewer sides for a round part: 6 stays a hex bolt, round things become octagons / decagons */
export const segs = (n: number) => (n <= 8 ? Math.max(3, n) : Math.min(10, Math.max(8, Math.round(n * 0.5))));

/** one normal per triangle (non-indexed) */
export function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.computeVertexNormals();
  return n;
}

/** cheap stable hash of a position (coincident vertices get the same value) */
function phash(x: number, y: number, z: number, s: number): number {
  const v = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719 + s * 4.1) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * push every vertex a little off its place (the same push for coincident
 * vertices, so the surface never cracks): irregular, hand-cut silhouettes
 */
export function jitter(g: THREE.BufferGeometry, amt: number, seed = 1, scale = 1): THREE.BufferGeometry {
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const q = 1 / Math.max(1e-6, scale);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const hx = phash(x * q, y * q, z * q, seed), hy = phash(x * q, y * q, z * q, seed + 7), hz = phash(x * q, y * q, z * q, seed + 13);
    P.setXYZ(i, x + (hx - 0.5) * 2 * amt, y + (hy - 0.5) * 2 * amt, z + (hz - 0.5) * 2 * amt);
  }
  P.needsUpdate = true;
  return flat(g);
}

/**
 * a few-sided cylinder along Y (centred), chamfered at both rims: rTop/rBot,
 * height h, `seg` sides (8 = octagon), chamfer c (fraction of the smaller of
 * radius and height; 0 = sharp), phase turns the flats (default: a flat faces +Z)
 */
export function fcyl(rTop: number, h: number, seg = 8, rBot = rTop, c = 0.18, open = false, phase?: number): THREE.BufferGeometry {
  const s = Math.max(3, Math.round(seg));
  const ch = Math.min(Math.min(rTop, rBot) * c, h * c);
  const pts: THREE.Vector2[] = [];
  const hy = h / 2;
  if (!open) pts.push(new THREE.Vector2(0, -hy));
  if (ch > 1e-6 && !open) {
    pts.push(new THREE.Vector2(Math.max(0, rBot - ch), -hy), new THREE.Vector2(rBot, -hy + ch), new THREE.Vector2(rTop, hy - ch), new THREE.Vector2(Math.max(0, rTop - ch), hy));
  } else {
    pts.push(new THREE.Vector2(rBot, -hy), new THREE.Vector2(rTop, hy));
  }
  if (!open) pts.push(new THREE.Vector2(0, hy));
  const g = new THREE.LatheGeometry(pts, s, phase ?? PI / s);
  return flat(g);
}

/** a lathe through [radius, y] pairs with few sides (flat facets) */
export function flathe(prof: number[][], seg = 8, phase?: number): THREE.BufferGeometry {
  const s = Math.max(3, Math.round(seg));
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), s, phase ?? PI / s);
  return flat(g);
}

/** BoxGeometry-style uvs (each face 0..1) chosen by the dominant normal */
function boxUV(g: THREE.BufferGeometry, w: number, h: number, d: number) {
  const P = g.getAttribute('position'), N = g.getAttribute('normal');
  const uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = (x + w / 2) / w; v = ny > 0 ? 1 - (z + d / 2) / d : (z + d / 2) / d; }
    else if (ax >= az) { u = nx > 0 ? (d / 2 - z) / d : (z + d / 2) / d; v = (y + h / 2) / h; }
    else { u = nz > 0 ? (x + w / 2) / w : (w / 2 - x) / w; v = (y + h / 2) / h; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** a box with every edge bevelled (c = chamfer as a fraction of the smallest side, or absolute when > 0.5 of nothing) */
export function fbox(w: number, h: number, d: number, c = 0.16, abs = false): THREE.BufferGeometry {
  const m = Math.min(w, h, d);
  const k = Math.max(0, Math.min(m * 0.49, abs ? c : m * c));
  const pts: THREE.Vector3[] = [];
  const W = w / 2, H = h / 2, D = d / 2;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    if (k < 1e-6) { pts.push(new THREE.Vector3(sx * W, sy * H, sz * D)); continue; }
    pts.push(
      new THREE.Vector3(sx * (W - k), sy * H, sz * (D - k)),
      new THREE.Vector3(sx * W, sy * (H - k), sz * (D - k)),
      new THREE.Vector3(sx * (W - k), sy * (H - k), sz * D),
    );
  }
  const g = new ConvexGeometry(pts);
  boxUV(g, w, h, d);
  return g;
}

/** a wedge / tapered block: bottom w x d, top tw x td (offset ox, oz), height h, bevelled */
export function ftaper(w: number, d: number, tw: number, td: number, h: number, c = 0.12, ox = 0, oz = 0): THREE.BufferGeometry {
  const k = Math.min(w, d, tw, td, h) * c;
  const pts: THREE.Vector3[] = [];
  const ring = (y: number, W: number, D: number, x0: number, z0: number, kk: number) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push(new THREE.Vector3(x0 + sx * (W / 2 - kk), y, z0 + sz * D / 2), new THREE.Vector3(x0 + sx * W / 2, y, z0 + sz * (D / 2 - kk)));
    }
  };
  ring(-h / 2, w - k * 2, d - k * 2, 0, 0, k); ring(-h / 2 + k, w, d, 0, 0, k);
  ring(h / 2 - k, tw, td, ox, oz, k); ring(h / 2, tw - k * 2, td - k * 2, ox, oz, k);
  const g = new ConvexGeometry(pts);
  boxUV(g, Math.max(w, tw), h, Math.max(d, td));
  return g;
}

/** a cut gem / pebble: an icosahedron (detail 0 or 1), jittered */
export function gem(r: number, detail = 0, rough = 0.12, seed = 3): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  return rough > 0 ? jitter(flat(g), r * rough, seed, r) : flat(g);
}
/** a faceted dome (the top half of a few-sided ball), base on y = 0 */
export function fdome(r: number, seg = 8, rings = 3, sy = 1): THREE.BufferGeometry {
  const prof: number[][] = [];
  for (let i = 0; i <= rings; i++) { const a = (i / rings) * PI / 2; prof.push([Math.cos(a) * r, Math.sin(a) * r * sy]); }
  prof.push([0, r * sy]);
  return flathe(prof, seg);
}
/** a faceted ball (few sides, few rings), centred */
export function fball(r: number, seg = 8, rings = 5): THREE.BufferGeometry {
  const prof: number[][] = [];
  for (let i = 0; i <= rings; i++) { const a = -PI / 2 + (i / rings) * PI; prof.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return flathe(prof, seg);
}
/** a ring (torus) in the XY plane: a few-sided tube bent round `seg` facets */
export function fring(R: number, r: number, seg = 10, tube = 4, arc = PI * 2): THREE.BufferGeometry {
  return flat(new THREE.TorusGeometry(R, r, Math.max(3, tube), Math.max(3, seg), arc));
}

/** points of a regular polygon (n sides, radius r, first corner at `phase`) */
export function ngon(n: number, r: number, phase = PI / n, sx = 1, sy = 1): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) { const a = phase + (i / n) * PI * 2; out.push(new THREE.Vector2(Math.cos(a) * r * sx, Math.sin(a) * r * sy)); }
  return out;
}
/** a rectangle with clipped corners (an octagonal plate outline), centred */
export function clipRect(w: number, h: number, c: number): THREE.Vector2[] {
  const W = w / 2, H = h / 2, k = Math.min(c, W * 0.9, H * 0.9);
  return [[-W + k, -H], [W - k, -H], [W, -H + k], [W, H - k], [W - k, H], [-W + k, H], [-W, H - k], [-W, -H + k]].map(([x, y]) => new THREE.Vector2(x, y));
}

/**
 * a polygon outline extruded along +Z from z = 0 by `depth`, with a single
 * bevel step `bev` (flat facets); holes optional. UVs: x, y in the plate's
 * own extent mapped 0..1 on the faces.
 */
export function plate(pts: THREE.Vector2[], depth: number, bev = 0, holes: THREE.Vector2[][] = []): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts);
  for (const h of holes) sh.holes.push(new THREE.Path(h));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-5, depth - bev * 2), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 1, curveSegments: 1, steps: 1 });
  g.translate(0, 0, bev);
  // uvs across the outline's bounding box
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const P = g.getAttribute('position');
  const uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) { uv[i * 2] = (P.getX(i) - x0) / Math.max(1e-6, x1 - x0); uv[i * 2 + 1] = (P.getY(i) - y0) / Math.max(1e-6, y1 - y0); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return flat(g);
}
/** a flat polygon (one face toward +Z) with uvs over its extent: decals, dial faces, windows */
export function face(pts: THREE.Vector2[]): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const P = g.getAttribute('position');
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) uv.setXY(i, (P.getX(i) - x0) / Math.max(1e-6, x1 - x0), (P.getY(i) - y0) / Math.max(1e-6, y1 - y0));
  return flat(g);
}

/** a few-sided tube from a to b (radius r) with flat ends */
export function frod(a: [number, number, number], b: [number, number, number], r: number, seg = 5): THREE.BufferGeometry {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = fcyl(r, Math.max(1e-5, len), seg, r, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
/** a faceted capsule-like rod: a few-sided prism with pointed (cone) ends, along Y from 0 to len */
export function fcapsule(r: number, len: number, seg = 6): THREE.BufferGeometry {
  const e = Math.min(r, len / 2);
  return flathe([[0, 0], [r * 0.7, e * 0.3], [r, e], [r, len - e], [r * 0.7, len - e * 0.3], [0, len]], seg);
}

/** merge several flat pieces into one geometry (all must share attributes: position, normal, uv) */
export function mergeFlat(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const p of parts) {
    const P = p.getAttribute('position'), N = p.getAttribute('normal'), U = p.getAttribute('uv');
    for (let i = 0; i < P.count; i++, o++) {
      pos[o * 3] = P.getX(i); pos[o * 3 + 1] = P.getY(i); pos[o * 3 + 2] = P.getZ(i);
      nor[o * 3] = N.getX(i); nor[o * 3 + 1] = N.getY(i); nor[o * 3 + 2] = N.getZ(i);
      if (U) { uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i); }
    }
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** an inverted hull: the same shape pushed out along its normals, drawn back faces only in black */
export function hull(g: THREE.BufferGeometry, w: number): THREE.BufferGeometry {
  const h = g.clone();
  const P = h.getAttribute('position') as THREE.BufferAttribute;
  // average the normals of coincident vertices so the shell stays closed at hard edges
  const acc = new Map<string, THREE.Vector3>();
  const N = h.getAttribute('normal') as THREE.BufferAttribute;
  const key = (i: number) => `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
  for (let i = 0; i < P.count; i++) { const k = key(i); let v = acc.get(k); if (!v) { v = new THREE.Vector3(); acc.set(k, v); } v.x += N.getX(i); v.y += N.getY(i); v.z += N.getZ(i); }
  for (const v of acc.values()) v.normalize();
  for (let i = 0; i < P.count; i++) { const v = acc.get(key(i))!; P.setXYZ(i, P.getX(i) + v.x * w, P.getY(i) + v.y * w, P.getZ(i) + v.z * w); }
  return h;
}
