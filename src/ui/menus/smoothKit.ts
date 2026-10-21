// Smooth low-poly parts for the subject room's machines and props: rounded
// boxes, lathes, capsules, tubes and extrusions with vertex colours, merged per
// material so each moving piece is one or two draw calls. Lit by real lights
// with metal / paint / gloss / wood / lamp materials (Lambert on low quality).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type MatKey = 'metal' | 'chrome' | 'paint' | 'gloss' | 'wood' | 'rubber' | 'lamp' | 'glass';
export type Mats = Record<MatKey, THREE.Material>;

/** the shared materials (one set per room) */
export function makeMats(low: boolean): Mats {
  const std = (metalness: number, roughness: number) => low
    ? new THREE.MeshLambertMaterial({ vertexColors: true })
    : new THREE.MeshStandardMaterial({ vertexColors: true, metalness, roughness });
  return {
    metal: std(0.6, 0.45), chrome: std(0.85, 0.22), paint: std(0.18, 0.62), gloss: std(0.02, 0.3), wood: std(0, 0.72), rubber: std(0, 0.85),
    lamp: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glass: new THREE.MeshBasicMaterial({ color: 0x9ab0b8, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
  };
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
/** a transform: position, rotation (radians), scale (number or [x,y,z]) */
export function at(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1): THREE.Matrix4 {
  E.set(rx, ry, rz); Q.setFromEuler(E); V.set(x, y, z);
  if (typeof s === 'number') S.set(s, s, s); else S.set(s[0], s[1], s[2]);
  return M.clone().compose(V, Q, S);
}

export class SmoothBuilder {
  private parts = new Map<MatKey, THREE.BufferGeometry[]>();
  /** add a geometry in a colour (a little grime is dithered into the vertex colours) */
  add(mat: MatKey, g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4, grime = 0.12) {
    const geo = g;
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    if (m) geo.applyMatrix4(m);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const h = Math.sin(p.getX(i) * 91.7 + p.getY(i) * 47.3 + p.getZ(i) * 13.1) * 43758.5453;
      const g2 = 1 - grime * (h - Math.floor(h)) * (p.getY(i) < 0.05 ? 1.6 : 1);
      col[i * 3] = c.r * g2; col[i * 3 + 1] = c.g * g2; col[i * 3 + 2] = c.b * g2;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    let list = this.parts.get(mat);
    if (!list) { list = []; this.parts.set(mat, list); }
    list.push(geo.index ? geo.toNonIndexed() : geo);
    return this;
  }
  /** one mesh per material used */
  build(mats: Mats): THREE.Group {
    const g = new THREE.Group();
    for (const [k, list] of this.parts) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mats[k]);
      mesh.name = k;
      g.add(mesh);
    }
    return g;
  }
}

// ------------------------------------------------------------------ primitives
export const rbox = (w: number, h: number, d: number, r: number, segs = 2) => new RoundedBoxGeometry(w, h, d, segs, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
export const cyl = (rTop: number, rBot: number, h: number, segs = 16, open = false) => new THREE.CylinderGeometry(rTop, rBot, h, segs, 1, open);
export const ball = (r: number, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
export const capsule = (r: number, len: number, caps = 3, radial = 10) => new THREE.CapsuleGeometry(r, len, caps, radial);
export const torus = (R: number, r: number, radial = 8, tubular = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, radial, tubular, arc);
/** a profile [radius, y][] turned round Y */
export const lathe = (pts: [number, number][], segs = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), segs);
/** a tube along points (smoothed) */
export function tube(pts: [number, number, number][], r: number, segs = 20, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, segs, r, radial, false);
}
/** a rounded-rectangle frame (outer w×h, an inner window), extruded with a soft bevel */
export function frame(w: number, h: number, iw: number, ih: number, r: number, ir: number, depth: number) {
  const rr = (s: THREE.Shape | THREE.Path, W: number, H: number, R: number) => {
    s.moveTo(-W / 2 + R, -H / 2); s.lineTo(W / 2 - R, -H / 2); s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R);
    s.lineTo(W / 2, H / 2 - R); s.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2); s.lineTo(-W / 2 + R, H / 2);
    s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R); s.lineTo(-W / 2, -H / 2 + R); s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2);
  };
  const s = new THREE.Shape(); rr(s, w, h, r);
  const hole = new THREE.Path(); rr(hole, iw, ih, ir); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: Math.min(r, 0.012), bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** diagonal hazard stripes on a strip (w × h), as thin extruded parallelograms; yellow ones only (lay on black) */
export function hazardStripes(w: number, h: number, n: number, depth = 0.004) {
  const parts: THREE.BufferGeometry[] = [];
  const step = w / n;
  for (let i = 0; i < n; i += 2) {
    const s = new THREE.Shape();
    const x0 = -w / 2 + i * step;
    s.moveTo(x0, -h / 2); s.lineTo(x0 + step, -h / 2); s.lineTo(Math.min(w / 2, x0 + step * 1.6), h / 2); s.lineTo(Math.min(w / 2, x0 + step * 0.6), h / 2);
    parts.push(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }));
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}
