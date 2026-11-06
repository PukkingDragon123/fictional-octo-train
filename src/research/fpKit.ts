// Shared first-person bits for research: the field sampling close-up
// (src/research/collect.ts, in the game's overlay scene) and the research lab's
// bench games (src/ui/menus/rooms/researchBench.ts, in the menu's own 3D).
//   holdArm(arm, root, pose, on, local, elbow, palmHint)  put a hand's grip on a point of an object
//   syringe() / scalpel() / swab() / vialProp() / pipette() / forceps()  faceted hand tools
// Flat-shaded Lambert/Standard materials so the pixel pipeline reads them as pixel art.
import * as THREE from 'three';
import type { FpArm, HandPose } from '../fp/hands';

const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _g = new THREE.Vector3(), _mb = new THREE.Matrix4();

/** aim an arm from an elbow point so its grip lands on `on`'s local point (palmHint picks the roll) */
export function holdArm(arm: FpArm, root: THREE.Object3D, pose: HandPose, on: THREE.Object3D, local: [number, number, number], elbow: [number, number, number], palmHint: [number, number, number]) {
  arm.pose(pose);
  root.updateMatrixWorld(true);
  const target = root.worldToLocal(on.localToWorld(_t.set(local[0], local[1], local[2])));
  const dir = _d.set(target.x - elbow[0], target.y - elbow[1], target.z - elbow[2]).normalize();
  const z = _z.set(palmHint[0], palmHint[1], palmHint[2]);
  z.addScaledVector(dir, -z.dot(dir)).normalize();
  const x = _x.crossVectors(dir, z).normalize();
  _mb.makeBasis(x, dir, z);
  arm.root.quaternion.setFromRotationMatrix(_mb);
  arm.root.position.set(elbow[0], elbow[1], elbow[2]);
  arm.root.updateMatrixWorld(true);
  const g = root.worldToLocal(arm.grip.getWorldPosition(_g));
  arm.root.position.x += target.x - g.x; arm.root.position.y += target.y - g.y; arm.root.position.z += target.z - g.z;
}

const L = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.55, metalness: 0.1, ...o });
const steel = () => L({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.6 });
const glass = () => L({ color: 0xd8f0f4, transparent: true, opacity: 0.38, roughness: 0.1, depthWrite: false });

export interface Syringe { g: THREE.Group; plunger: THREE.Group; fill: THREE.Mesh; fillMat: THREE.MeshStandardMaterial; set(k: number): void }
/** a glass syringe along -Y (the needle points down): set(k) draws 0..1 */
export function syringe(fluid = 0x3ac880): Syringe {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.1, 8, 1, true), glass()); g.add(barrel);
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0012, 0.001), L({ color: 0x1a1a22 })); m.position.set(0, -0.04 + i * 0.016, 0.0091); g.add(m); }
  const fillMat = L({ color: fluid, emissive: new THREE.Color(fluid).multiplyScalar(0.35), transparent: true, opacity: 0.85 });
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.0082, 0.0082, 1, 8), fillMat); fill.scale.y = 0.001; g.add(fill);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, 0.012, 8), steel()); hub.position.y = -0.056; g.add(hub);
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0009, 0.06, 4), steel()); needle.position.y = -0.092; g.add(needle);
  const flange = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.004, 0.012), L({ color: 0xe8e8e0 })); flange.position.y = 0.05; g.add(flange);
  const plunger = new THREE.Group(); g.add(plunger);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.11, 0.004), L({ color: 0xe8e8e0 })); rod.position.y = 0.055; plunger.add(rod);
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.004, 8), L({ color: 0xe8e8e0 })); thumb.position.y = 0.11; plunger.add(thumb);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 8), L({ color: 0x1a1a1a, roughness: 0.9 })); plunger.add(seal);
  const set = (k: number) => {
    k = Math.max(0, Math.min(1, k));
    plunger.position.y = -0.045 + k * 0.09;
    fill.scale.y = Math.max(0.001, k * 0.09); fill.position.y = -0.048 + fill.scale.y / 2;
    fill.visible = k > 0.01;
  };
  set(0);
  return { g, plunger, fill, fillMat, set };
}
/** a scalpel along -Y (the blade down) */
export function scalpel(): THREE.Group {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.004), steel()); h.position.y = 0.04; g.add(h);
  for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.0085, 0.0015, 0.0045), L({ color: 0x8a8e94, metalness: 0.5 })); r.position.y = 0.05 + i * 0.006; g.add(r); }
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.004, -0.004); sh.lineTo(0.003, -0.03); sh.lineTo(-0.002, -0.038); sh.lineTo(-0.003, -0.004); sh.lineTo(0, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.0008, bevelEnabled: false }), L({ color: 0xf0f4f8, roughness: 0.15, metalness: 0.85 })); blade.position.set(0, -0.014, -0.0004); g.add(blade);
  return g;
}
/** a sampling swab along -Y */
export function swab(tip = 0xf2f0e8): { g: THREE.Group; tip: THREE.Mesh } {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.13, 4), L({ color: 0xe8dcc0 })); stick.position.y = 0.04; g.add(stick);
  const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0045, 0), L({ color: tip, roughness: 0.95 })); t.scale.set(1, 1.8, 1); t.position.y = -0.027; g.add(t);
  return { g, tip: t };
}
/** a stainless pair of forceps along -Y; open(k) spreads the tips */
export function forceps(): { g: THREE.Group; open(k: number): void } {
  const g = new THREE.Group();
  const legs: THREE.Mesh[] = [];
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.11, 0.002), steel()); m.geometry.translate(0, -0.055, 0); m.position.set(s * 0.002, 0.05, 0); g.add(m); legs.push(m); }
  return { g, open: (k) => { legs[0].rotation.z = 0.02 + k * 0.08; legs[1].rotation.z = -0.02 - k * 0.08; } };
}
export interface Vial { g: THREE.Group; fill: THREE.Mesh; fillMat: THREE.MeshStandardMaterial; cap: THREE.Mesh; set(k: number): void }
/** a stoppered sample vial (open: the cap rides up) */
export function vialProp(content = 0x3ac880, capColor = 0xc8302a, r = 0.012, h = 0.07): Vial {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8, 1, true), glass()));
  const fillMat = L({ color: content, emissive: new THREE.Color(content).multiplyScalar(0.3), transparent: true, opacity: 0.9 });
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 1, 8), fillMat); g.add(fill);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.004, 8), glass()); bottom.position.y = -h / 2; g.add(bottom);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.36, 8, 1, true, -0.9, 1.8), L({ color: 0xf2f0e4, roughness: 0.9 })); label.position.y = -h * 0.08; g.add(label);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, h * 0.2, 8), L({ color: capColor })); cap.position.y = h / 2 + h * 0.08; g.add(cap);
  const set = (k: number) => { k = Math.max(0, Math.min(1, k)); fill.visible = k > 0.01; fill.scale.y = Math.max(0.001, k * h * 0.86); fill.position.y = -h / 2 + 0.002 + fill.scale.y / 2; };
  set(0);
  return { g, fill, fillMat, cap, set };
}
/** a glass dropper pipette with a rubber bulb, along -Y */
export function pipette(fluid = 0x3ac880): { g: THREE.Group; bulb: THREE.Mesh; fill: THREE.Mesh; set(k: number): void } {
  const g = new THREE.Group();
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0012, 0.11, 6, 1, true), glass()), {}));
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 6), L({ color: fluid, emissive: new THREE.Color(fluid).multiplyScalar(0.35) })); g.add(fill);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), L({ color: 0xc8302a, roughness: 0.8 })); bulb.scale.y = 1.6; bulb.position.y = 0.066; g.add(bulb);
  const set = (k: number) => { k = Math.max(0, Math.min(1, k)); fill.visible = k > 0.01; fill.scale.y = Math.max(0.001, k * 0.07); fill.position.y = -0.05 + fill.scale.y / 2; };
  set(0);
  return { g, bulb, fill, set };
}
