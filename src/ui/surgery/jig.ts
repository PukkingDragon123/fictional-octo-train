// The crafting jig: a swing-arm fabrication tray clamped to the operating
// table's far rail. Stowed, it hangs back behind the table; deployed, it swings
// out over the subject's belly. What you build with is laid out on it (the
// real item models from your pack), the orderly brings each piece to the vise
// in the middle and the surgeon welds it into the growing part.
import * as THREE from 'three';
import { Kit, cbox, tbox, prism, ccyl, ccylX, hexHead, ngon, type P2 } from './geo';
import type { Mats } from './pix';
import { TABLE_Y, TABLE_HALF_Z } from './room';

const ARM = 0.5;
/** where the pieces lie on the tray (tray space: x along the table, z across) */
const SLOTS: [number, number][] = [[-0.17, -0.1], [0.17, -0.1], [-0.2, 0.08], [0.2, 0.08], [-0.06, 0.12], [0.07, -0.13]];

export class CraftJig {
  group = new THREE.Group();
  private swing = new THREE.Group();
  /** the tray (pieces and the assembly sit here) */
  tray = new THREE.Group();
  /** the vise in the middle: the assembly grows here */
  vise = new THREE.Group();
  private jaws: THREE.Group[] = [];
  private ang = -1.9; private vel = 0; private tgt = -1.9;
  open = 1;
  constructor(M: Mats) {
    // the post: a clamp on the far rail, a lathed column, a knuckle
    this.group.position.set(0.12, TABLE_Y - 0.12, -TABLE_HALF_Z - 0.07);
    const k = new Kit();
    k.put(M.darksteel, cbox(0.14, 0.12, 0.1, 0.02), 0, 0, 0);
    k.put(M.steel, hexHead(0.02, 0.03), 0.04, 0.0, 0.055, { rx: Math.PI / 2 });
    k.put(M.gunmetal, ccyl(0.032, 0.5, 8, 0.008), 0, 0.05, 0);
    k.put(M.hazard, ccyl(0.036, 0.05, 8, 0.004), 0, 0.3, 0);
    this.group.add(k.group());
    this.swing.position.y = 0.56;
    this.group.add(this.swing);
    const s = new Kit();
    s.add(M.gunmetal, cbox(0.1, 0.09, 0.1, 0.02));
    s.put(M.olive, cbox(0.06, 0.05, ARM, 0.012), 0, 0, ARM / 2);
    s.put(M.darksteel, cbox(0.02, 0.07, ARM * 0.7, 0.005), 0.035, -0.01, ARM / 2);
    s.put(M.gunmetal, cbox(0.09, 0.1, 0.09, 0.02), 0, -0.02, ARM);
    this.swing.add(s.group());
    this.tray.position.set(0, -0.08, ARM + 0.02);
    this.swing.add(this.tray);
    const t = new Kit();
    // a steel plate with a raised rim, hazard edge and a drain slot
    t.put(M.steel, prism([[-0.3, -0.2], [0.3, -0.2], [0.33, -0.17], [0.33, 0.17], [0.3, 0.2], [-0.3, 0.2], [-0.33, 0.17], [-0.33, -0.17]], 0.025, 0.004), 0, -0.02, 0, { rx: -Math.PI / 2, tile: 0.4 });
    for (const [x, z, w, d] of [[0, -0.205, 0.64, 0.016], [0, 0.205, 0.64, 0.016], [-0.335, 0, 0.016, 0.4], [0.335, 0, 0.016, 0.4]] as const) t.put(M.darksteel, cbox(w, 0.035, d, 0.004), x, 0.0, z);
    t.put(M.hazard, cbox(0.64, 0.012, 0.03, 0.003), 0, -0.035, 0.2);
    t.put(M.gunmetal, cbox(0.06, 0.05, 0.06, 0.012), 0, -0.05, 0);
    for (let i = 0; i < 4; i++) t.put(M.steel, hexHead(0.008, 0.008), -0.28 + i * 0.187, 0.004, -0.17);
    this.tray.add(t.group());
    // the vise: a fixed jaw and a moving one on a screw
    this.vise.position.set(0, 0.02, 0);
    this.tray.add(this.vise);
    for (const sx of [-1, 1]) {
      const j = new THREE.Group(); j.position.x = sx * 0.07;
      const jk = new Kit();
      jk.put(M.gunmetal, cbox(0.035, 0.06, 0.12, 0.008), 0, 0.03, 0);
      jk.put(M.darksteel, cbox(0.012, 0.04, 0.11, 0.003), -sx * 0.02, 0.04, 0);
      j.add(jk.group());
      this.vise.add(j); this.jaws.push(j);
    }
    const sk = new Kit(); sk.put(M.chrome, ccylX(0.008, 0.24, 6), 0, 0.03, 0); this.vise.add(sk.group());
    this.swing.rotation.y = this.ang;
  }
  /** swing out over the body (true) or back behind the table */
  deploy(out: boolean) { this.tgt = out ? 0 : -1.9; this.vel += out ? 2 : -2; }
  get deployed() { return Math.abs(this.ang) < 0.05; }
  /** world position of the vise */
  center(out = new THREE.Vector3()) { this.group.updateMatrixWorld(true); return this.vise.getWorldPosition(out); }
  /** lay item meshes out on the tray (returns them, scaled to zero: pop them in) */
  layout(meshes: THREE.Mesh[]) {
    meshes.forEach((m, i) => {
      const [x, z] = SLOTS[i % SLOTS.length];
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!, size = bb.getSize(new THREE.Vector3());
      const k = Math.min(1.2, 0.19 / Math.max(0.01, size.x, size.y, size.z));
      m.userData.k = k;
      m.position.set(x, 0.002 - bb.min.y * k, z);
      m.rotation.y = (i * 1.3) % 3;
      m.scale.setScalar(0.0001);
      this.tray.add(m);
    });
  }
  update(dt: number) {
    const w = 9, z = 0.42;
    this.vel += ((this.tgt - this.ang) * w * w - 2 * z * w * this.vel) * dt;
    this.ang += this.vel * dt;
    this.swing.rotation.y = this.ang;
    for (const [i, j] of this.jaws.entries()) j.position.x = (i ? 1 : -1) * (0.035 + this.open * 0.05);
  }
}

export { ngon, tbox, type P2 };
