// Faceted low-poly parts for the close-ups: chamfered boxes, few-sided
// cylinders with bevelled rims, hex rivet heads, polygon rings, faceted rods —
// merged into one geometry per material with per-part tints (vertex colours)
// and box-projected uvs so the metal maps tile at a real-world scale. Every
// triangle carries its own normal (flat facets). Nothing here is a raw box.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbox, fcyl, fcapsule, fdome, fring, fball, segs } from '../ui/touch/facet';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();

export class Shape {
  private parts: THREE.BufferGeometry[] = [];
  /** uv repeats per metre */
  constructor(public uvScale = 2.5) {}

  private push(g: THREE.BufferGeometry, x: number, y: number, z: number, color: number, rot?: [number, number, number]) {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    _q.setFromEuler(_e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0));
    _m.compose(_p.set(x, y, z), _q, _s);
    geo.applyMatrix4(_m);
    const n = geo.attributes.position.count;
    const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute;
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const [u, v] = ax >= ay && ax >= az ? [pz, py] : ay >= az ? [px, pz] : [px, py];
      uv[i * 2] = u * this.uvScale; uv[i * 2 + 1] = v * this.uvScale;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') geo.deleteAttribute(k);
    this.parts.push(geo);
    return this;
  }

  /** a bevelled box: x, z = centre, y = bottom (like the ModelBuilder) */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color = 0xffffff, r = 0.004, rot?: [number, number, number]) {
    const rr = Math.max(0.0005, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
    const g = fbox(w, h, d, rr, true);
    if (rot) g.translate(0, h / 2, 0);
    return this.push(g, x, rot ? y : y + h / 2, z, color, rot);
  }
  /** a cylinder along y from its bottom, edges softened with a small chamfer ring */
  cyl(x: number, y: number, z: number, r: number, h: number, color = 0xffffff, sg = 12, rot?: [number, number, number], rTop = r) {
    const g = fcyl(rTop, h, segs(sg), r, 0.12);
    g.translate(0, h / 2, 0);
    return this.push(g, x, y, z, color, rot);
  }
  /** a round-ended rod along y from its bottom */
  capsule(x: number, y: number, z: number, r: number, len: number, color = 0xffffff, rot?: [number, number, number]) {
    const g = fcapsule(r, Math.max(r * 2 + 0.0001, len), 6);
    return this.push(g, x, y, z, color, rot);
  }
  /** a domed rivet / screw head facing +z (or rot) */
  dome(x: number, y: number, z: number, r: number, color = 0xffffff, rot: [number, number, number] = [Math.PI / 2, 0, 0]) {
    const g = fdome(r, 6, 2, 0.55);
    return this.push(g, x, y, z, color, rot);
  }
  /** a ring (torus) in the xy plane; four segments make a bevelled square frame */
  ring(x: number, y: number, z: number, r: number, tube: number, color = 0xffffff, radial = 16, rot?: [number, number, number]) {
    const g = fring(r, tube, radial <= 8 ? radial : Math.min(10, Math.max(8, Math.round(radial * 0.5))), 4);
    return this.push(g, x, y, z, color, rot);
  }
  sphere(x: number, y: number, z: number, r: number, color = 0xffffff, sy = 1) {
    const g = fball(r, 7, 4);
    g.scale(1, sy, 1);
    return this.push(g, x, y, z, color);
  }
  get empty() { return this.parts.length === 0; }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false) || new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
