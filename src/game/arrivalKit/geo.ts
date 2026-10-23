// Small faceted-geometry helpers for the arrival's own scenes (the taped
// wall, the pack in your hands): chamfered boxes, few-segment lathes, lofts
// of chamfered sections, all flat shaded (visible facets) with planar UVs
// that stretch a pixel texture once across each face. Plus pixel textures
// from a PixelCanvas (NearestFilter, no mipmaps, sRGB).
import * as THREE from 'three';
import { PixelCanvas } from '../../gfx/pixel';

/** deterministic 0..1 hash */
export function hash3(x: number, y: number, z = 0): number {
  let h = Math.imul(Math.round(x * 1000) * 374761393 + Math.round(y * 1000) * 668265263 + Math.round(z * 1000) * 2246822519, 0x27d4eb2d);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

/** a chamfered box (every edge bevelled by b), centred, flat shaded, uv 0..1 per face */
export function cbox(w: number, h: number, d: number, b = 0.01, jit = 0, seed = 0): THREE.BufferGeometry {
  b = Math.min(b, w * 0.45, h * 0.45, d * 0.45);
  const X = w / 2, Y = h / 2, Z = d / 2;
  // corner (sx, sy, sz): the three points on the faces meeting there
  const P = (sx: number, sy: number, sz: number, f: 0 | 1 | 2): [number, number, number] =>
    f === 0 ? [sx * X, sy * (Y - b), sz * (Z - b)] : f === 1 ? [sx * (X - b), sy * Y, sz * (Z - b)] : [sx * (X - b), sy * (Y - b), sz * Z];
  const tris: number[][] = [];
  const quad = (a: number[], bb: number[], c: number[], dd: number[]) => { tris.push(a, bb, c, a, c, dd); };
  const S = [-1, 1];
  // main faces
  quad(P(1, -1, -1, 0), P(1, 1, -1, 0), P(1, 1, 1, 0), P(1, -1, 1, 0));
  quad(P(-1, -1, 1, 0), P(-1, 1, 1, 0), P(-1, 1, -1, 0), P(-1, -1, -1, 0));
  quad(P(-1, 1, -1, 1), P(-1, 1, 1, 1), P(1, 1, 1, 1), P(1, 1, -1, 1));
  quad(P(-1, -1, 1, 1), P(-1, -1, -1, 1), P(1, -1, -1, 1), P(1, -1, 1, 1));
  quad(P(-1, -1, 1, 2), P(1, -1, 1, 2), P(1, 1, 1, 2), P(-1, 1, 1, 2));
  quad(P(1, -1, -1, 2), P(-1, -1, -1, 2), P(-1, 1, -1, 2), P(1, 1, -1, 2));
  // edge chamfers (along x: between y and z faces, etc.)
  for (const sy of S) for (const sz of S) {
    const a = P(-1, sy, sz, 1), c = P(1, sy, sz, 2), bb = P(1, sy, sz, 1), dd = P(-1, sy, sz, 2);
    if (sy * sz > 0) quad(a, dd, c, bb); else quad(a, bb, c, dd);
  }
  for (const sx of S) for (const sz of S) {
    const a = P(sx, -1, sz, 0), bb = P(sx, 1, sz, 0), c = P(sx, 1, sz, 2), dd = P(sx, -1, sz, 2);
    if (sx * sz > 0) quad(a, bb, c, dd); else quad(a, dd, c, bb);
  }
  for (const sx of S) for (const sy of S) {
    const a = P(sx, sy, -1, 0), bb = P(sx, sy, 1, 0), c = P(sx, sy, 1, 1), dd = P(sx, sy, -1, 1);
    if (sx * sy > 0) quad(a, dd, c, bb); else quad(a, bb, c, dd);
  }
  // corner triangles
  for (const sx of S) for (const sy of S) for (const sz of S) {
    const a = P(sx, sy, sz, 0), bb = P(sx, sy, sz, 1), c = P(sx, sy, sz, 2);
    if (sx * sy * sz > 0) tris.push(a, bb, c); else tris.push(a, c, bb);
  }
  return fromTris(tris, jit, seed, [w, h, d]);
}

/** triangles (flat list of points, 3 per tri) -> flat-shaded geometry with box-projected uvs; optional vertex jitter */
export function fromTris(tris: number[][], jit = 0, seed = 0, ext?: [number, number, number]): THREE.BufferGeometry {
  const pos = new Float32Array(tris.length * 3);
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  tris.forEach((p, i) => {
    let [x, y, z] = p;
    if (jit) { x += (hash3(p[0], p[1], p[2] + seed) - 0.5) * jit; y += (hash3(p[1], p[2], p[0] + seed) - 0.5) * jit; z += (hash3(p[2], p[0], p[1] + seed) - 0.5) * jit; }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    mnx = Math.min(mnx, x); mny = Math.min(mny, y); mnz = Math.min(mnz, z); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); mxz = Math.max(mxz, z);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // planar uv by each triangle's dominant axis, 0..1 across the bounds
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(tris.length * 2);
  const ex = ext ? [ext[0], ext[1], ext[2]] : [mxx - mnx || 1, mxy - mny || 1, mxz - mnz || 1];
  const o = [mnx, mny, mnz];
  for (let t = 0; t < tris.length; t += 3) {
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < 3; k++) { ax += Math.abs(n.getX(t + k)); ay += Math.abs(n.getY(t + k)); az += Math.abs(n.getZ(t + k)); }
    for (let k = 0; k < 3; k++) {
      const i = t + k, x = (pos[i * 3] - o[0]) / ex[0], y = (pos[i * 3 + 1] - o[1]) / ex[1], z = (pos[i * 3 + 2] - o[2]) / ex[2];
      const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
      uv[i * 2] = u; uv[i * 2 + 1] = v;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** a few-segment lathe (faceted), profile points [r, y] bottom to top */
export function flathe(profile: [number, number][], segs = 7, phase = 0): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phase);
  const ng = g.toNonIndexed();
  g.dispose();
  ng.computeVertexNormals();
  return ng;
}

/**
 * A loft of chamfered rectangular sections (a bag, a pocket): each section is [y, halfW, halfD, zOff].
 * 8 points per ring; closed top and bottom by fans. u runs round the ring, v up the loft.
 */
export function loft(sections: [number, number, number, number][], cham = 0.3, capTop = true, capBot = true): THREE.BufferGeometry {
  const ring = (s: [number, number, number, number]) => {
    const [y, w, d, z] = s, cw = w * cham, cd = d * cham;
    return [[w, y, z + d - cd], [w - cw, y, z + d], [-w + cw, y, z + d], [-w, y, z + d - cd], [-w, y, z - d + cd], [-w + cw, y, z - d], [w - cw, y, z - d], [w, y, z - d + cd]];
  };
  const rings = sections.map(ring);
  const pos: number[] = [], uv: number[] = [];
  const H = sections[sections.length - 1][0] - sections[0][0] || 1, y0 = sections[0][0];
  const push = (p: number[], u: number, v: number) => { pos.push(p[0], p[1], p[2]); uv.push(u, v); };
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8, u0 = i / 8, u1 = (i + 1) / 8;
      const va = (sections[s][0] - y0) / H, vb = (sections[s + 1][0] - y0) / H;
      push(A[i], u0, va); push(A[j], u1, va); push(B[j], u1, vb);
      push(A[i], u0, va); push(B[j], u1, vb); push(B[i], u0, vb);
    }
  }
  const cap = (R: number[][], up: boolean) => {
    const c = R.reduce((a, p) => [a[0] + p[0] / 8, a[1] + p[1] / 8, a[2] + p[2] / 8], [0, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      if (up) { push(c, 0.5, 0.5); push(R[i], 0.5 + R[i][0], 0.5 + R[i][2]); push(R[j], 0.5 + R[j][0], 0.5 + R[j][2]); }
      else { push(c, 0.5, 0.5); push(R[j], 0.5 + R[j][0], 0.5 + R[j][2]); push(R[i], 0.5 + R[i][0], 0.5 + R[i][2]); }
    }
  };
  // ring winding: points go round counter-clockwise seen from above? (x+ z+ ... ) -> fix orientation by test below
  if (capTop) cap(rings[rings.length - 1], true);
  if (capBot) cap(rings[0], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** a pixel texture from a PixelCanvas painter */
export function pixTex(w: number, h: number, draw: (pc: PixelCanvas) => void, repeat = false): THREE.CanvasTexture {
  const pc = new PixelCanvas(w, h);
  draw(pc);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return canvasTex(cv, repeat);
}
/** wrap a canvas as a crisp pixel texture */
export function canvasTex(cv: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** merge geometries (all non-indexed, same attributes) into one */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'color'].filter((n) => geos.every((g) => g.getAttribute(n)));
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = geos[0].getAttribute(n).itemSize;
    let len = 0;
    for (const g of geos) len += g.getAttribute(n).count * size;
    const arr = new Float32Array(len);
    let o = 0;
    for (const g of geos) {
      const ng = g.index ? g.toNonIndexed() : g;
      const a = ng.getAttribute(n) as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, o); o += a.count * size;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/** bake a transform into a geometry (returns it) */
export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s));
  g.applyMatrix4(m);
  return g;
}

/** paint every vertex of a geometry with one colour (for vertex-coloured merges) */
export function tint(g: THREE.BufferGeometry, hex: number, jitter = 0, seed = 0): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (hash3(i, seed, 7) - 0.5) * jitter;
    for (let j = 0; j < 3 && i + j < n; j++) { arr[(i + j) * 3] = c.r * k; arr[(i + j) * 3 + 1] = c.g * k; arr[(i + j) * 3 + 2] = c.b * k; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
