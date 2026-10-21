// Smooth low-poly forms for first-person props (overlay only): bevelled rounded
// plates, lathed vessels, capsules and rings, with physically lit materials.
// Cached by their parameters so reopening a view never rebuilds geometry.
import * as THREE from 'three';

const geo = new Map<string, THREE.BufferGeometry>();
const mats = new Map<string, THREE.MeshStandardMaterial>();
const cached = (k: string, f: () => THREE.BufferGeometry) => { let g = geo.get(k); if (!g) { g = f(); geo.set(k, g); } return g; };

/** a physically lit material (shared per parameter set) */
export function std(color: number, roughness = 0.7, metalness = 0, emissive = 0): THREE.MeshStandardMaterial {
  const k = `${color}:${roughness}:${metalness}:${emissive}`;
  let m = mats.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); if (emissive) m.emissive = new THREE.Color(color).multiplyScalar(emissive); mats.set(k, m); }
  return m;
}

/** a plate w x h with rounded corners and bevelled edges, thickness d, centred, facing +Z */
export function roundPlate(w: number, h: number, r: number, d: number, bevel = Math.min(d * 0.4, 0.004)): THREE.BufferGeometry {
  return cached(`rp:${w}:${h}:${r}:${d}:${bevel}`, () => {
    const s = new THREE.Shape(), x = -w / 2 + bevel, y = -h / 2 + bevel, W = w - bevel * 2, H = h - bevel * 2, R = Math.max(0.001, Math.min(r, W / 2, H / 2));
    s.moveTo(x + R, y); s.lineTo(x + W - R, y); s.quadraticCurveTo(x + W, y, x + W, y + R); s.lineTo(x + W, y + H - R);
    s.quadraticCurveTo(x + W, y + H, x + W - R, y + H); s.lineTo(x + R, y + H); s.quadraticCurveTo(x, y + H, x, y + H - R); s.lineTo(x, y + R); s.quadraticCurveTo(x, y, x + R, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, d - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -d / 2 + bevel);
    g.computeVertexNormals();
    return g;
  });
}

/** a vessel turned on a lathe from (radius, height) points, around +Y */
export function lathe(key: string, pts: [number, number][], segs = 24): THREE.BufferGeometry {
  return cached('la:' + key, () => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs); g.computeVertexNormals(); return g; });
}

/** a capsule of radius r and straight length len along +Y, base at the origin */
export function capsule(r: number, len: number, segs = 8): THREE.BufferGeometry {
  return cached(`ca:${r}:${len}:${segs}`, () => { const g = new THREE.CapsuleGeometry(r, len, 3, segs); g.translate(0, len / 2 + r, 0); return g; });
}

/** a ring (bezel, rim) of radius R and tube r in the XY plane */
export function ring(R: number, r: number, segs = 24): THREE.BufferGeometry {
  return cached(`ri:${R}:${r}:${segs}`, () => new THREE.TorusGeometry(R, r, 6, segs));
}

/** a rounded rod (handle, bar) of radius r, length len along +X, centred */
export function rod(r: number, len: number, segs = 10): THREE.BufferGeometry {
  return cached(`ro:${r}:${len}:${segs}`, () => { const g = new THREE.CapsuleGeometry(r, len, 3, segs); g.rotateZ(Math.PI / 2); return g; });
}

/** orient an object so its +Y runs along dir and its +Z (palm) faces as close to `face` as possible */
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
export function aimY(o: THREE.Object3D, dir: THREE.Vector3, face: THREE.Vector3) {
  _y.copy(dir).normalize();
  _z.copy(face).addScaledVector(_y, -face.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  o.quaternion.setFromRotationMatrix(_m);
}
