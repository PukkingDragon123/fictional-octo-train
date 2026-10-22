// Faceted low-poly modelling kit for the operating theatre: chamfered boxes
// and tapered hulls (convex hulls of their corner points), extruded polygon
// outlines with a one-step bevel (and cut-outs), few-sided lathes, faceted
// tubes and gems, deterministic vertex jitter. Every piece is made
// non-indexed (so flat shading shows each facet), box-projected onto its
// pixel texture at a fixed texel density, tinted per piece, and merged per
// material into one mesh (Kit.group), so a whole machine costs a handful of
// draw calls.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hashf } from '../../core/rng';

export type P2 = [number, number];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
const _col = new THREE.Color();

/**
 * Prepare a piece: non-indexed, box-projected uv in its own space (tile = metres
 * per texture repeat; uv = keep the piece's own uv scaled), transformed by m,
 * flat normals, a colour attribute.
 */
export function prep(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, tile: number, tint: number, uvScale?: [number, number]): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = (src.getAttribute('position') as THREE.BufferAttribute).clone();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', pos);
  const n = pos.count, uv = new Float32Array(n * 2);
  const ouv = uvScale ? src.getAttribute('uv') as THREE.BufferAttribute | undefined : undefined;
  if (ouv) for (let i = 0; i < n; i++) { uv[i * 2] = ouv.getX(i) * uvScale![0]; uv[i * 2 + 1] = ouv.getY(i) * uvScale![1]; }
  else {
    const k = 1 / tile;
    for (let i = 0; i + 2 < n; i += 3) {
      _a.fromBufferAttribute(pos, i); _b.fromBufferAttribute(pos, i + 1); _c.fromBufferAttribute(pos, i + 2);
      _n.subVectors(_c, _b).cross(_a.clone().sub(_b));
      const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
      for (let j = 0; j < 3; j++) {
        const v = j === 0 ? _a : j === 1 ? _b : _c;
        let u: number, w: number;
        if (ax >= ay && ax >= az) { u = v.z * Math.sign(_n.x || 1); w = v.y; }
        else if (ay >= az) { u = v.x; w = v.z * Math.sign(_n.y || 1); }
        else { u = v.x * -Math.sign(_n.z || 1); w = v.y; }
        uv[(i + j) * 2] = u * k; uv[(i + j) * 2 + 1] = w * k;
      }
    }
  }
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (m) out.applyMatrix4(m);
  out.computeVertexNormals();
  _col.setHex(tint);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b; }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (src !== g) src.dispose();
  return out;
}

export interface AddOpts { tile?: number; tint?: number; uv?: [number, number] }

/** accumulates pieces per material under a transform stack, then merges them */
export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  defTile = 0.5;
  push() { this.stack.push(this.m.clone()); return this; }
  pop() { const m = this.stack.pop(); if (m) this.m.copy(m); return this; }
  at(x: number, y: number, z: number) { this.m.multiply(new THREE.Matrix4().makeTranslation(x, y, z)); return this; }
  rx(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationX(a)); return this; }
  ry(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationY(a)); return this; }
  rz(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationZ(a)); return this; }
  sc(x: number, y = x, z = x) { this.m.multiply(new THREE.Matrix4().makeScale(x, y, z)); return this; }
  /** add a piece at the current transform (the geometry is consumed) */
  add(mat: THREE.Material, g: THREE.BufferGeometry, o: AddOpts = {}) {
    const p = prep(g, this.m, o.tile ?? this.defTile, o.tint ?? 0xffffff, o.uv);
    g.dispose();
    let l = this.parts.get(mat);
    if (!l) { l = []; this.parts.set(mat, l); }
    l.push(p);
    return this;
  }
  /** add at an offset without touching the stack */
  put(mat: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, o: AddOpts & { rx?: number; ry?: number; rz?: number } = {}) {
    this.push().at(x, y, z);
    if (o.ry) this.ry(o.ry); if (o.rx) this.rx(o.rx); if (o.rz) this.rz(o.rz);
    this.add(mat, g, o);
    return this.pop();
  }
  get empty() { return this.parts.size === 0; }
  /** one mesh per material */
  group(cast = true, receive = true): THREE.Group {
    const grp = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const l of list) l.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const me = new THREE.Mesh(g, mat);
      me.castShadow = cast; me.receiveShadow = receive;
      grp.add(me);
    }
    this.parts.clear();
    return grp;
  }
}

// ------------------------------------------------------------------ shapes (all centred or based at the origin, metres)
export function hull(pts: number[][]): THREE.BufferGeometry {
  return new ConvexGeometry(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
}
/** a box with its edges chamfered by c, centred on the origin */
export function cbox(w: number, h: number, d: number, c = Math.min(w, h, d) * 0.18): THREE.BufferGeometry {
  return tbox(w, h, d, w, d, c);
}
/** a chamfered hull: bottom w x d at -h/2, top tw x td at +h/2 (offset top by ox, oz) */
export function tbox(w: number, h: number, d: number, tw: number, td: number, c = Math.min(w, h, d) * 0.18, ox = 0, oz = 0): THREE.BufferGeometry {
  c = Math.min(c, w / 2.01, h / 2.01, d / 2.01, tw / 2.01, td / 2.01);
  const pts: number[][] = [];
  for (const sy of [-1, 1]) {
    const W = (sy < 0 ? w : tw) / 2, D = (sy < 0 ? d : td) / 2, Y = (sy * h) / 2, x0 = sy > 0 ? ox : 0, z0 = sy > 0 ? oz : 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push([x0 + sx * (W - c), Y, z0 + sz * (D - c)]);
      pts.push([x0 + sx * W, Y - sy * c, z0 + sz * (D - c)]);
      pts.push([x0 + sx * (W - c), Y - sy * c, z0 + sz * D]);
    }
  }
  return hull(pts);
}
/** extrude an outline drawn in the xy plane, centred on z (bevel = one chamfer step), with optional cut-outs */
export function prism(outline: P2[], depth: number, bevel = 0, holes: P2[][] = []): THREE.BufferGeometry {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** a lathe about y: profile [radius, y] from bottom to top */
export function lathe(profile: P2[], segs = 8, phase = 0): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), segs, phase);
  return g;
}
/** a faceted cylinder along +y from 0 to h with chamfered rims */
export function ccyl(r: number, h: number, segs = 8, c = r * 0.18, rTop = r): THREE.BufferGeometry {
  c = Math.min(c, h / 2.01, r * 0.9, rTop * 0.9);
  return lathe([[0, 0], [r - c, 0], [r, c], [rTop, h - c], [rTop - c, h], [0, h]], segs, Math.PI / segs);
}
/** the same along +x / +z, centred */
export function ccylX(r: number, len: number, segs = 8, c?: number, rTop?: number) { const g = ccyl(r, len, segs, c, rTop); g.translate(0, -len / 2, 0); g.rotateZ(-Math.PI / 2); return g; }
export function ccylZ(r: number, len: number, segs = 8, c?: number, rTop?: number) { const g = ccyl(r, len, segs, c, rTop); g.translate(0, -len / 2, 0); g.rotateX(Math.PI / 2); return g; }
/** a hex nut / bolt head along y */
export function hexHead(r: number, h: number) { return ccyl(r, h, 6, r * 0.25); }
/** a faceted gem / lump */
export function gem(rx: number, ry: number, rz: number, detail = 0, seed = 0, jit = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.scale(rx, ry, rz);
  return jit ? jitter(g, jit, seed) : g;
}
/** a regular polygon outline (n sides, radius r, rotated by a) */
export function ngon(n: number, r: number, a = 0, ry = r): P2[] {
  return Array.from({ length: n }, (_, i) => { const t = a + (i / n) * Math.PI * 2; return [Math.cos(t) * r, Math.sin(t) * ry] as P2; });
}
/** a saw blade outline: n teeth between radius r0 and r1, raked */
export function sawOutline(n: number, r0: number, r1: number): P2[] {
  const o: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 0.72) / n) * Math.PI * 2;
    o.push([Math.cos(a) * r0, Math.sin(a) * r0], [Math.cos(b) * r1, Math.sin(b) * r1]);
  }
  return o;
}
/** deterministic vertex jitter: equal positions move together, so facets stay closed */
export function jitter(g: THREE.BufferGeometry, amt: number, seed = 0): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const hx = Math.round(x * 997), hy = Math.round(y * 991), hz = Math.round(z * 983);
    p.setXYZ(i, x + (hashf(hx, hy + hz, seed) - 0.5) * 2 * amt, y + (hashf(hy, hz + hx, seed + 1) - 0.5) * 2 * amt, z + (hashf(hz, hx + hy, seed + 2) - 0.5) * 2 * amt);
  }
  p.needsUpdate = true;
  return g;
}
/** a static faceted tube through points (cables, pipes) */
export function tube(pts: THREE.Vector3[], r: number, radial = 5, tubular = 0): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, tubular || Math.max(4, pts.length * 4), r, radial, false);
}

// ------------------------------------------------------------------ a live hose (rebuilt in place every frame)
const _t = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _ref = new THREE.Vector3();
/**
 * A hose / cable whose ends follow two anchors. The positions are rewritten in
 * place each frame (no allocation); flat shading needs no normals.
 */
export class LiveHose {
  mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute;
  private curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], false, 'centripetal');
  constructor(mat: THREE.Material, public r: number, public radial = 5, public seg = 12, ribs = 10) {
    const n = (seg + 1) * radial;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1), nor = new Float32Array(n * 3);
    for (let i = 0; i <= seg; i++) for (let j = 0; j < radial; j++) { const k = i * radial + j; uv[k * 2] = (i / seg) * ribs; uv[k * 2 + 1] = j / radial; nor[k * 3 + 1] = 1; }
    const idx: number[] = [];
    for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    g.setAttribute('position', this.pos);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }
  /** route through 4 points (world space, the mesh must sit in an identity-transformed parent) */
  set(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3) {
    const P = this.curve.points;
    P[0].copy(p0); P[1].copy(p1); P[2].copy(p2); P[3].copy(p3);
    const a = this.pos.array as Float32Array;
    _ref.set(0, 1, 0);
    for (let i = 0; i <= this.seg; i++) {
      const t = i / this.seg;
      this.curve.getPointAt(t, _w);
      this.curve.getTangentAt(t, _t);
      if (Math.abs(_t.dot(_ref)) > 0.95) _ref.set(1, 0, 0);
      _u.crossVectors(_t, _ref).normalize();
      _ref.crossVectors(_u, _t).normalize();
      for (let j = 0; j < this.radial; j++) {
        const ang = (j / this.radial) * Math.PI * 2, c = Math.cos(ang) * this.r, s = Math.sin(ang) * this.r;
        const k = (i * this.radial + j) * 3;
        a[k] = _w.x + _u.x * c + _ref.x * s; a[k + 1] = _w.y + _u.y * c + _ref.y * s; a[k + 2] = _w.z + _u.z * c + _ref.z * s;
      }
    }
    this.pos.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); }
}
