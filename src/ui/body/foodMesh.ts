// First-person food as faceted low-poly models (no voxels): every food is a
// flat-shaded superellipsoid bent into its shape (an apple with a dimple,
// stem and leaf; a wrapped ration bar; a domed loaf; a banana's curve), with
// flat facets and vertex colours (skin, streaks, crust, wrapper). A bite is
// a real dent: the vertices inside a bite-shaped ellipsoid are pushed in onto
// its far wall with a scalloped tooth edge and turn the colour of the inside.
import * as THREE from 'three';
import { gem, fcapsule } from '../touch/facet';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mix, hash } from './pix';
import { foodAtlas } from './fpTex';

export type Kind = 'bar' | 'loaf' | 'sandwich' | 'fruit' | 'long' | 'meat' | 'fish' | 'can' | 'bowl' | 'cookie' | 'cheese' | 'egg' | 'weird' | 'blob';
export interface Recipe { kind: Kind; skin: number; flesh: number; wrap: number; extra: number; crunchy: boolean; juicy: boolean; hot: boolean; bad: '' | 'rotten' | 'raw' | 'poison'; label: string }

/** shape per kind: half extents (m), squareness (1 round .. 0.2 boxy), extras */
const SHAPE: Record<Kind, { h: [number, number, number]; e: number }> = {
  fruit: { h: [0.04, 0.038, 0.04], e: 1 }, egg: { h: [0.022, 0.03, 0.022], e: 1 }, blob: { h: [0.045, 0.028, 0.035], e: 0.85 }, weird: { h: [0.038, 0.034, 0.036], e: 0.9 },
  bar: { h: [0.062, 0.011, 0.025], e: 0.24 }, loaf: { h: [0.055, 0.03, 0.036], e: 0.36 }, sandwich: { h: [0.05, 0.024, 0.048], e: 0.3 },
  cookie: { h: [0.034, 0.007, 0.034], e: 0.45 }, cheese: { h: [0.045, 0.02, 0.03], e: 0.3 }, meat: { h: [0.056, 0.022, 0.038], e: 0.75 },
  fish: { h: [0.07, 0.018, 0.024], e: 0.9 }, long: { h: [0.07, 0.016, 0.016], e: 0.95 }, can: { h: [0.036, 0.022, 0.036], e: 0.3 }, bowl: { h: [0.062, 0.016, 0.062], e: 0.4 },
};

const _c = new THREE.Color(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

export class FoodModel {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly half: THREE.Vector3;
  private geo: THREE.BufferGeometry;
  /** each vertex's own sphere uv (the atlas panels are thirds of it) */
  private uv0: Float32Array;
  private edible: Uint8Array;
  private seed: number;
  /** bite size (m) */
  readonly biteR: number;

  constructor(readonly r: Recipe, seed: number) {
    this.seed = seed;
    const sh = SHAPE[r.kind];
    this.half = new THREE.Vector3(...sh.h);
    // a dense sphere, squared off into a superellipsoid and shaped per kind
    // low-poly: few enough rings that every facet shows under flat shading, enough for a bite to dent
    let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 16, 11);
    g.deleteAttribute('normal');
    g = mergeVertices(g, 1e-6);
    const P = g.getAttribute('position') as THREE.BufferAttribute;
    const UV = g.getAttribute('uv') as THREE.BufferAttribute;
    const n = P.count;
    const col = new Float32Array(n * 3);
    // the pixel atlas: skin in the first third, the inside in the second, the wrapper's print in the last
    this.uv0 = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { this.uv0[i * 2] = UV.getX(i); this.uv0[i * 2 + 1] = UV.getY(i); UV.setXY(i, UV.getX(i) / 3, UV.getY(i)); }
    this.edible = new Uint8Array(n).fill(1);
    const [hx, hy, hz] = sh.h;
    for (let i = 0; i < n; i++) {
      const ux = P.getX(i), uy = P.getY(i), uz = P.getZ(i);
      let x = sgnPow(ux, sh.e) * hx, y = sgnPow(uy, sh.e) * hy, z = sgnPow(uz, sh.e) * hz;
      const nz = hash(Math.round(ux * 40), Math.round(uy * 40) + Math.round(uz * 40) * 97, seed) - 0.5;
      let c = r.skin;
      switch (r.kind) {
        case 'fruit': {
          const k = 1 + nz * 0.05 + Math.sin(Math.atan2(uz, ux) * 5) * 0.012;
          x *= k; z *= k; y *= 1 + nz * 0.03;
          // the dimples where stem and flower sit
          const rr = Math.hypot(ux, uz);
          if (uy > 0) y -= 0.011 * Math.exp(-(rr * rr) / 0.06);
          else y += 0.006 * Math.exp(-(rr * rr) / 0.04);
          c = mix(r.skin, mix(r.skin, 0xf0d050, 0.6), Math.max(0, Math.sin(Math.atan2(uz, ux) * 9 + uy * 3) * 0.5 + nz) * 0.6);
          if (rr < 0.25 && uy < -0.9) c = 0x5a4a2a;
          break;
        }
        case 'egg': y *= uy > 0 ? 1.1 : 0.92; x *= 1 - Math.max(0, uy) * 0.12; z *= 1 - Math.max(0, uy) * 0.12; break;
        case 'long': {
          // a banana bends, a carrot tapers
          const t = (ux + 1) / 2;
          const taper = /carrot/i.test(r.label) ? 0.35 + 0.65 * t : 0.55 + 0.45 * Math.sin(t * Math.PI);
          y *= taper; z *= taper;
          if (!/carrot|cucumber|corn/i.test(r.label)) y += -0.02 * (1 - (ux * ux));
          if (/banana/i.test(r.label)) { c = Math.abs(ux) > 0.93 ? 0x4a3a1a : mix(r.skin, 0xc8a020, Math.max(0, nz)); }
          else c = mix(r.skin, 0xffffff, Math.max(0, Math.sin(ux * 40)) * 0.08);
          break;
        }
        case 'meat': case 'blob': case 'weird': {
          const k = 1 + nz * 0.14 + Math.sin(ux * 7 + uz * 5) * 0.05;
          x *= k; y *= k; z *= k;
          c = r.kind === 'weird' ? mix(r.skin, r.flesh, Math.sin(ux * 6 + uy * 9 + uz * 4) * 0.5 + 0.5) : mix(r.skin, 0x2a160a, Math.max(0, nz) * 0.6);
          break;
        }
        case 'fish': { const t = (ux + 1) / 2; y *= 0.5 + 0.5 * Math.sin(Math.min(1, t * 1.15) * Math.PI); z *= 0.45 + 0.55 * Math.sin(Math.min(1, t * 1.15) * Math.PI); c = uy > 0.2 ? mix(r.skin, 0x3a4a5a, 0.5) : mix(r.skin, 0xffffff, 0.2); break; }
        case 'loaf': if (uy > 0) y *= 1.25 + Math.sin(ux * 12) * 0.05; c = uy > -0.6 ? mix(r.skin, 0x6a3a12, Math.max(0, uy) * 0.4 + Math.max(0, nz) * 0.3) : mix(r.skin, r.flesh, 0.3); break;
        case 'sandwich': {
          const ay = Math.abs(uy);
          c = ay > 0.62 ? mix(r.skin, 0x9a6a2a, Math.max(0, nz)) : ay > 0.42 ? r.flesh : uy > 0.15 ? 0xe08a8a : uy > -0.15 ? 0xf0c040 : r.extra;
          break;
        }
        case 'cookie': c = nz > 0.32 ? r.extra : mix(r.skin, 0x8a5a2a, Math.max(0, nz) * 0.4); if (uy > 0.2) y += Math.sin(ux * 9) * Math.sin(uz * 9) * 0.0015; break;
        case 'cheese': c = (hash(Math.round(ux * 9), Math.round(uz * 9) + Math.round(uy * 9) * 31, 4) < 0.12) ? mix(r.skin, 0x8a6a10, 0.35) : uy > 0.85 ? mix(r.skin, 0xc89020, 0.4) : r.skin; break;
        case 'bar': {
          // the back half still in its crinkled wrapper (it is not food)
          if (ux > 0.12) {
            // the printed wrapper (its own colours from the atlas), torn ragged at the edge
            c = ux < 0.17 ? 0xdcdcdc : 0xffffff; this.edible[i] = 0; x *= 1.03; y *= 1.12; z *= 1.06;
            UV.setXY(i, 2 / 3 + Math.min(1, Math.max(0, (ux - 0.12) / 0.88)) / 3 * 0.98, Math.min(1, Math.max(0, uz * 0.5 + 0.5)));
            if (ux < 0.17) x += (hash(i, 9, seed) - 0.5) * 0.004;
          }
          else c = mix(r.skin, 0x3a1a08, Math.max(0, nz) * 0.4);
          break;
        }
        case 'can': case 'bowl': { const k = 1 + nz * 0.06; y *= uy > 0 ? 1 + nz * 0.25 : 1; x *= k; z *= k; c = nz > 0.25 ? r.flesh : mix(r.skin, 0x2a1408, Math.max(0, -nz) * 0.4); break; }
      }
      if (r.bad === 'rotten' && hash(i, 3, seed) < 0.12) c = hash(i, 5, seed) < 0.5 ? 0x9ab868 : 0x5a7a3a;
      P.setXYZ(i, x, y, z);
      _c.setHex(c); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true, map: foodAtlas(r, seed) }));
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.biteR = Math.max(0.011, Math.min(0.026, Math.max(hx, hy, hz) * 0.42));
    this.extras();
  }

  /** stems, leaves, a bone, a tail: faceted little parts */
  private extras() {
    const r = this.r, h = this.half;
    const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ flatShading: true, color })); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); this.group.add(m);
    };
    if (r.kind === 'fruit') {
      add(new THREE.CylinderGeometry(0.0016, 0.0022, 0.016, 6), 0x5a3a1a, 0.001, h.y - 0.004, 0, 0, 0, -0.25);
      const leaf = gem(1, 0, 0.1, 2); leaf.scale(0.013, 0.0016, 0.006);
      add(leaf, 0x4a9a2a, 0.01, h.y + 0.002, 0.002, 0, 0.4, 0.35);
    } else if (r.kind === 'meat' && /bone|leg|rib|drumstick|chop/i.test(r.label)) {
      add(fcapsule(0.006, 0.052, 6).translate(0, -0.026, 0), 0xf2ecd8, h.x + 0.016, 0, 0, 0, 0, Math.PI / 2);
      add(gem(0.008, 0, 0.15, 3), 0xe8e0c8, h.x + 0.044, 0, 0);
    } else if (r.kind === 'fish') {
      const tail = new THREE.ConeGeometry(0.016, 0.028, 5); tail.scale(1, 1, 0.25);
      add(tail, 0x8a949c, h.x + 0.008, 0, 0, 0, 0, Math.PI / 2);
      add(gem(0.003, 0, 0), 0x101010, -h.x * 0.72, h.y * 0.3, h.z * 0.62);
    } else if (r.kind === 'long' && /carrot/i.test(r.label)) {
      for (let i = 0; i < 3; i++) add(new THREE.ConeGeometry(0.004, 0.03, 4), 0x4a9a2a, h.x + 0.012, (i - 1) * 0.004, (i - 1) * 0.003, 0, 0, -Math.PI / 2 + (i - 1) * 0.3);
    }
  }

  /** the edible vertex nearest a point (food space), or -1 when nothing edible is left */
  nearest(p: THREE.Vector3): number {
    const P = this.geo.getAttribute('position') as THREE.BufferAttribute;
    let best = -1, bd = 1e9;
    for (let i = 0; i < P.count; i++) {
      if (!this.edible[i]) continue;
      const d = (P.getX(i) - p.x) ** 2 + (P.getY(i) - p.y) ** 2 + (P.getZ(i) - p.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /**
   * take a bite toward `from` (food space: the mouth, or the spoon above a can): the vertices inside
   * a bite ellipsoid go in onto its far wall, scalloped by teeth, and show the inside. Calls crumb()
   * for some of the bitten points. Returns how many vertices moved.
   */
  bite(from: THREE.Vector3, scale: number, crumb: (x: number, y: number, z: number, c: number) => void): number {
    const i0 = this.nearest(from);
    if (i0 < 0) return 0;
    const P = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const C = this.geo.getAttribute('color') as THREE.BufferAttribute;
    const UV = this.geo.getAttribute('uv') as THREE.BufferAttribute;
    const R = this.biteR * scale;
    const v = _a.set(P.getX(i0), P.getY(i0), P.getZ(i0));
    const dir = _b.copy(from).sub(v).normalize();
    const ctr = v.addScaledVector(dir, R * 0.42);
    // two axes across the bite for the tooth scallop
    _u.set(0, 1, 0); if (Math.abs(dir.y) > 0.9) _u.set(1, 0, 0);
    _u.addScaledVector(dir, -_u.dot(dir)).normalize();
    _w.crossVectors(dir, _u);
    const flesh = new THREE.Color(this.r.flesh), skin = new THREE.Color(this.r.skin);
    let moved = 0;
    for (let i = 0; i < P.count; i++) {
      const dx = P.getX(i) - ctr.x, dy = P.getY(i) - ctr.y, dz = P.getZ(i) - ctr.z;
      // the bite is an ellipsoid, a little flatter along the jaw
      const along = dx * dir.x + dy * dir.y + dz * dir.z;
      const a1 = dx * _u.x + dy * _u.y + dz * _u.z, a2 = dx * _w.x + dy * _w.y + dz * _w.z;
      const ang = Math.atan2(a1, a2);
      const rr = R * (1 + 0.09 * Math.sin(ang * 11 + this.seed));
      const d = Math.sqrt(along * along + a1 * a1 * 1.25 + a2 * a2);
      if (d >= rr) continue;
      const k = rr / Math.max(1e-5, d);
      if (moved < 26 && (moved & 1) === 0) crumb(P.getX(i), P.getY(i), P.getZ(i), (C.getX(i) + C.getY(i) > 1.4) ? this.r.flesh : this.r.skin);
      P.setXYZ(i, ctr.x + dx * k, ctr.y + dy * k, ctr.z + dz * k);
      // the inside shows: flesh, a touch darker where the teeth tore it
      const rim = Math.max(0, 1 - (rr - d) / (rr * 0.35));
      _c.copy(flesh).lerp(skin, rim * 0.25).multiplyScalar(0.92 + hash(i, this.seed, 7) * 0.12);
      C.setXYZ(i, _c.r, _c.g, _c.b);
      // the inside's texture: crumb, fibre, flesh
      UV.setXY(i, 1 / 3 + this.uv0[i * 2] / 3 * 0.98, this.uv0[i * 2 + 1]);
      moved++;
    }
    if (moved) { P.needsUpdate = true; C.needsUpdate = true; UV.needsUpdate = true; this.geo.computeVertexNormals(); }
    return moved;
  }

  /** for cans and bowls: the contents sink as they are eaten */
  setLevel(k: number) { if (this.r.kind === 'can' || this.r.kind === 'bowl') { this.mesh.scale.y = Math.max(0.08, k); this.mesh.position.y = -this.half.y * (1 - Math.max(0.08, k)); } }

  dispose() { this.geo.dispose(); this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { if (m.geometry !== this.geo) m.geometry.dispose(); (m.material as THREE.MeshLambertMaterial).map?.dispose(); (m.material as THREE.Material).dispose(); } }); this.group.removeFromParent(); }
}
