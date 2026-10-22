// Faceted, bevelled low-poly forms for the ModelBuilder (never raw blocks):
// chamfered boxes, faceted rods, polygon rings and domes, stamped into a
// builder with the atlas texture, tint and glow it uses for everything else.
// Every triangle has its own normal (flat facets). Geometry is generated once
// per model (models are cached by their owners).
import * as THREE from 'three';
import { fbox, fcapsule, fring, fdome, fball } from '../ui/touch/facet';
import type { ModelBuilder, PrimOpts } from '../gfx/modelBuilder';
import { atlas } from '../gfx/atlas';

const M = new THREE.Matrix4();

/** dress a plain three geometry with the builder's attributes and stamp it in */
function stamp(mb: ModelBuilder, g: THREE.BufferGeometry, m: THREE.Matrix4, tex: string, o: PrimOpts, uvScale: number) {
  const n = g.getAttribute('position').count;
  const r = atlas().get(tex);
  const c = new THREE.Color(o.color ?? 0xffffff);
  const col = new Float32Array(n * 3), atl = new Float32Array(n * 4), fx = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    atl[i * 4] = r.u0; atl[i * 4 + 1] = r.v0; atl[i * 4 + 2] = r.du; atl[i * 4 + 3] = r.dv;
    fx[i * 2] = o.emissive ?? 0;
  }
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aAtlas', new THREE.BufferAttribute(atl, 4));
  g.setAttribute('aFx', new THREE.BufferAttribute(fx, 2));
  if (!g.getIndex()) { const idx: number[] = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); }
  mb.appendGeometry(g, M.copy((mb as any).m).multiply(m));
  g.dispose();
}

/** a rounded box: x,z centre, y bottom (like box()), corner radius r */
export function rbox(mb: ModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, tex: string, o: PrimOpts = {}, r = Math.min(w, h, d) * 0.22, segs = 2) {
  void segs;
  const g = fbox(w, h, d, Math.min(r * 0.8, w / 2, h / 2, d / 2) * 0.98, true);
  stamp(mb, g, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), tex, o, Math.max(w, h, d) * 4);
}
/** a capsule from a to b (radius r) */
export function capsule(mb: ModelBuilder, a: [number, number, number], b: [number, number, number], r: number, tex: string, o: PrimOpts = {}, segs = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const L = Math.max(0.0001, len) + r * 2;
  const g = fcapsule(r, L, Math.max(5, Math.min(7, Math.round(segs * 0.75)))).translate(0, -L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  stamp(mb, g, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), tex, o, (len + r * 2) * 4);
}
/** a ring lying flat (axis +Y) at x, y, z */
export function ring(mb: ModelBuilder, x: number, y: number, z: number, r: number, tube: number, tex: string, o: PrimOpts = {}, segs = 16, axis: 'y' | 'z' | 'x' = 'y') {
  const g = fring(r, tube, segs <= 8 ? segs : Math.min(10, Math.max(8, Math.round(segs * 0.5))), 4);
  const rot = axis === 'y' ? new THREE.Matrix4().makeRotationX(Math.PI / 2) : axis === 'x' ? new THREE.Matrix4().makeRotationY(Math.PI / 2) : new THREE.Matrix4();
  stamp(mb, g, new THREE.Matrix4().makeTranslation(x, y, z).multiply(rot), tex, o, r * 12);
}
/** a dome (upper half of a sphere, squashed by sy) sitting on y */
export function dome(mb: ModelBuilder, x: number, y: number, z: number, r: number, tex: string, o: PrimOpts & { sy?: number } = {}, segs = 14) {
  const g = fdome(r, Math.max(6, Math.min(8, Math.round(segs * 0.6))), 3);
  stamp(mb, g, new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(1, o.sy ?? 1, 1)), tex, o, r * 8);
}
/** an ellipsoid (sx, sy, sz radii) centred at x, y, z */
export function blob(mb: ModelBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, tex: string, o: PrimOpts = {}, segs = 12) {
  const g = fball(1, Math.max(6, Math.min(9, Math.round(segs * 0.7))), Math.max(4, Math.min(6, segs >> 1)));
  stamp(mb, g, new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz)), tex, o, Math.max(sx, sy, sz) * 8);
}
